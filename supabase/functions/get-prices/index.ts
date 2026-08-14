import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Stripe Product IDs — update here if products are replaced in Stripe
const PRODUCT_IDS = {
    monthly:  'prod_V4DEmZ0NVfrFib',
    lifetime: 'prod_V4DE3uFHJtpzDx',
};

// ISO 3166-1 region → ISO 4217 currency
const REGION_CURRENCY: Record<string, string> = {
    US: 'USD', GB: 'GBP', BR: 'BRL', AU: 'AUD', CA: 'CAD',
    JP: 'JPY', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP',
    PE: 'PEN', UY: 'UYU', PY: 'PYG', BO: 'BOB', VE: 'VES',
    DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', PT: 'EUR',
    NL: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR',
    IE: 'EUR', LU: 'EUR', MT: 'EUR', SK: 'EUR', SI: 'EUR',
    EE: 'EUR', LV: 'EUR', LT: 'EUR', CY: 'EUR',
    CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN',
    CZ: 'CZK', HU: 'HUF', RO: 'RON', RU: 'RUB', TR: 'TRY',
    IN: 'INR', CN: 'CNY', KR: 'KRW', SG: 'SGD', HK: 'HKD',
    TW: 'TWD', ZA: 'ZAR', NG: 'NGN', IL: 'ILS', SA: 'SAR',
    AE: 'AED', NZ: 'NZD', ID: 'IDR', MY: 'MYR', TH: 'THB',
    PH: 'PHP', UA: 'UAH',
};

function getCurrencyFromRequest(req: Request): string {
    const acceptLang = req.headers.get('Accept-Language') ?? 'en-US';
    // e.g. "pt-BR,pt;q=0.9,en;q=0.8" → "pt-BR" → region "BR"
    const primaryLocale = acceptLang.split(',')[0].trim();
    const region = primaryLocale.split('-')[1]?.toUpperCase();
    // Allow explicit override via query param: ?currency=BRL
    const url = new URL(req.url);
    const override = url.searchParams.get('currency')?.toUpperCase();
    return override ?? (region ? (REGION_CURRENCY[region] ?? 'USD') : 'USD');
}

async function getExchangeRate(from: string, to: string): Promise<number | null> {
    try {
        // open.er-api.com — free, no API key required
        const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
        if (!res.ok) throw new Error(`Exchange rate API error: ${res.status}`);
        const data = await res.json();
        return data.rates?.[to] ?? null;
    } catch {
        return null;
    }
}

function formatPrice(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
        return new Response(JSON.stringify({ error: 'Missing STRIPE_SECRET_KEY' }), {
            status: 500,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }

    try {
        const currency = getCurrencyFromRequest(req);

        // 1. Fetch active prices for each product
        const fetchActivePrice = async (productId: string) => {
            const res = await fetch(
                `https://api.stripe.com/v1/prices?product=${productId}&active=true&limit=1`,
                { headers: { Authorization: `Bearer ${stripeKey}` } },
            );
            if (!res.ok) throw new Error(`Stripe prices error for ${productId}: ${res.status}`);
            const data = await res.json();
            const price = data.data?.[0];
            if (!price) throw new Error(`No active price for product ${productId}`);
            return price;
        };

        const [monthlyPrice, lifetimePrice] = await Promise.all([
            fetchActivePrice(PRODUCT_IDS.monthly),
            fetchActivePrice(PRODUCT_IDS.lifetime),
        ]);

        // Base amounts in USD cents
        let monthlyAmount  = monthlyPrice.unit_amount  / 100;
        let lifetimeAmount = lifetimePrice.unit_amount / 100;

        // 2. Convert to target currency if different from USD
        if (currency !== 'USD') {
            const rate = await getExchangeRate('USD', currency);
            if (rate) {
                monthlyAmount  = monthlyAmount  * rate;
                lifetimeAmount = lifetimeAmount * rate;
            }
            // If rate not found, amounts stay in USD and we format as USD
        }

        // If conversion failed, fall back to showing USD amounts
        const displayCurrency = (currency !== 'USD' && monthlyAmount === monthlyPrice.unit_amount / 100)
            ? 'USD'
            : currency;

        return new Response(
            JSON.stringify({
                monthly:  formatPrice(monthlyAmount,  displayCurrency),
                lifetime: formatPrice(lifetimeAmount, displayCurrency),
                currency: displayCurrency,
            }),
            { headers: { ...CORS, 'Content-Type': 'application/json' } },
        );
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }
});
