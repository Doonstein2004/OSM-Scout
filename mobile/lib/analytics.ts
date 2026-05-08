import { Platform } from 'react-native';
import { supabase } from './supabase';
import { track } from '@vercel/analytics';

/**
 * lib/analytics.ts
 * Centralized analytics for OSM Scout.
 * Logs to both Vercel Analytics (Web/General) and Supabase (Custom Funnels).
 */

export type AnalyticsSection = 'scout' | 'smart' | 'fantasy' | 'lists' | 'paywall' | 'general';

export interface AnalyticsEvent {
    name: string;
    section?: AnalyticsSection;
    metadata?: Record<string, any>;
}

export const logEvent = async ({ name, section = 'general', metadata = {} }: AnalyticsEvent) => {
    const platform = Platform.OS;

    // 1. Log to Vercel Analytics (Primarily for Web, but works everywhere)
    try {
        track(name, {
            section,
            platform,
            ...metadata
        });
    } catch (e) {
        // Silently fail if vercel analytics is blocked
    }

    // 2. Log to Supabase for deep funnel analysis
    try {
        const { error } = await supabase.from('user_events').insert({
            event_name: name,
            section,
            platform,
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
            }
        });

        if (error) throw error;
    } catch (e) {
        console.warn('[Analytics] Failed to log to Supabase:', e);
    }

    if (__DEV__) {
        console.log(`[Analytics] 📊 Event: ${name} | Section: ${section}`, metadata);
    }
};

// ─── Predefined Event Helpers ────────────────────────────────────────────────

export const Analytics = {
    // Search Events
    trackSearch: (filters: any) => logEvent({ 
        name: 'search_performed', 
        section: 'scout', 
        metadata: { filters } 
    }),
    
    trackLimitReached: (limitType: 'searches' | 'lists') => logEvent({ 
        name: 'limit_reached', 
        section: limitType === 'searches' ? 'scout' : 'lists',
        metadata: { type: limitType }
    }),

    // Monetization Funnel
    trackPaywallView: (fromSection: AnalyticsSection) => logEvent({ 
        name: 'view_paywall', 
        section: fromSection 
    }),

    trackPlanSelection: (planId: string, section: AnalyticsSection) => logEvent({ 
        name: 'plan_selected', 
        section, 
        metadata: { planId } 
    }),

    trackPurchaseSuccess: (plan: string) => logEvent({ 
        name: 'purchase_success', 
        section: 'paywall', 
        metadata: { plan } 
    }),

    // Feature Usage
    trackUpsellView: (feature: 'smart' | 'fantasy') => logEvent({ 
        name: 'view_upsell', 
        section: feature 
    }),

    trackMagicFilterSave: (isSmart: boolean) => logEvent({ 
        name: 'magic_filter_saved', 
        section: isSmart ? 'smart' : 'scout' 
    })
};
