import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

/**
 * Pulls a two-letter country out of a locale tag.
 *
 * Rejects anything that is not two letters, which is what kept Argentina on
 * dollars: Latin American Spanish is sent as `es-419`, and `419` is a UN region
 * code, not a country. It matched nothing in the table and fell through to USD.
 * A bare `es` has no region at all and did the same.
 */
function countryFromLocale(locale: string): string | null {
    const part = locale.split('-')[1]?.toUpperCase();
    return part && /^[A-Z]{2}$/.test(part) ? part : null;
}

/**
 * The caller's currency, most reliable source first.
 *
 * The client knows its own region; the Accept-Language header is a guess that
 * is frequently regionless. Asking the header first is how this defaulted a
 * whole continent to dollars.
 */
function getCurrencyFromRequest(req: Request): string {
    const url = new URL(req.url);

    const override = url.searchParams.get('currency')?.toUpperCase();
    if (override) return override;

    // Supplied by the client from the device locale.
    const region = url.searchParams.get('region')?.toUpperCase();
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];

    const acceptLang = req.headers.get('Accept-Language') ?? '';
    for (const entry of acceptLang.split(',')) {
        const country = countryFromLocale(entry.split(';')[0].trim());
        if (country && REGION_CURRENCY[country]) return REGION_CURRENCY[country];
    }

    return 'USD';
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

        // Base amounts and currency come from the active Stripe price
        const baseCurrency = monthlyPrice.currency.toUpperCase(); // e.g. BRL
        let monthlyAmount  = monthlyPrice.unit_amount  / 100;
        let lifetimeAmount = lifetimePrice.unit_amount / 100;

        // Convert to target currency if different from the base price currency
        if (currency !== baseCurrency) {
            const rate = await getExchangeRate(baseCurrency, currency);
            if (rate) {
                monthlyAmount  = monthlyAmount  * rate;
                lifetimeAmount = lifetimeAmount * rate;
            }
        }

        // If conversion failed or not needed, show base currency amounts
        const displayCurrency = (currency !== baseCurrency && monthlyAmount === monthlyPrice.unit_amount / 100)
            ? baseCurrency
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
