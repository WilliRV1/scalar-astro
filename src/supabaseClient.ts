import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const inMemoryStore = {
    athletes: [
        {
            id: '1',
            name: 'DEMO John Doe',
            avatar_url: null,
            payment_status: 'pending',
            cut_day: '05',
            snatch_rm: '95',
            clean_rm: '115'
        },
        {
            id: '2',
            name: 'DEMO Sarah Connor',
            avatar_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAsC_F_XKleY-2N6iMfqWmlAcL0QwmS9ldzUH1E-7r0mbIQe458B33_Sa6tXqPeLmTfWnl5nYQf9uKXVBN8rerYz1T5hhdWqChNYvPUMpnTVpj4tTCtxxrJOYtXUsyvCabWMhnKcuHFvf9Cl0IlCmq2r7jiv5w3ZUwv10FH8Uu8hyqEDOOdmimP4jhS_vMpOqN5Lc3JRUVhVjQpTLtEanQ-ClwANaw2E0HvA9odBMwxEU8DKjrix46qowjF-hJzps0kgVY2YN_EJM8',
            payment_status: 'active',
            cut_day: '15',
            snatch_rm: '65',
            clean_rm: '85'
        },
        {
            id: '3',
            name: 'DEMO Mike Tyson',
            avatar_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC5EskrZE3I6whoSj7n4T5nPMjy9HqENK_DF1Ir7Mxv7kH8t2b1Bs1WCRcYORh8r0IUWylJvq6nUW2x9PauXqqsNP3lGpXC6LPsGyDJAh2hl2-oFXZo5hji_TzJvzP4i9Dk3l7Zm8rmB0Wpl0FcrzEy_KYvO10PQn9TwDRvdRMsnK_w5ki-g4RJFRrGc2m5rc0vbufRcXa7CC2DusqmU24QRs3u4wS72DVgSz3qBd-6mf-IqA-RGFnBQl-hUf2Xoz2SWABcDE1semA',
            payment_status: 'pending',
            cut_day: '01',
            snatch_rm: '105',
            clean_rm: '135'
        }
    ]
}

// Check if variables are set and look like real URLs/Keys
const isConfigured = supabaseUrl && supabaseUrl.startsWith('http') && supabaseAnonKey;

export const supabase = isConfigured
    ? createClient(supabaseUrl, supabaseAnonKey)
    : {
        from: (table: string) => ({
            select: () => {
                console.warn('Supabase not configured. Returning demo data.');
                return Promise.resolve({ data: (inMemoryStore as any)[table] || [], error: null })
            },
            insert: () => Promise.resolve({ data: null, error: { message: 'Demo Mode: Insert not supported' } }),
            update: (updates: any) => {
                console.warn('Supabase not configured. Mock update:', updates);
                return Promise.resolve({ data: null, error: null }) // Pretend it worked
            },
            eq: () => ({
                // Chaining for update().eq()
                select: () => Promise.resolve({ data: [], error: null }),
                // Mock the promise return for update chain
                then: (resolve: any) => resolve({ data: null, error: null })
            })
        })
    } as any;
