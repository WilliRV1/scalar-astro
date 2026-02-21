import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const inMemoryStore = {
    athletes: [
        {
            id: '1',
            name: 'John Doe',
            avatar_url: null,
            payment_status: 'pending',
            cut_day: '05',
            referral_source: 'Instagram',
            back_squat: '120',
            bench_press: '80',
            deadlift: '140',
            shoulder_press: '55',
            front_squat: '100',
            clean_rm: '95',
            push_press: '65',
            karen: '8:30',
            burpees_100: '7:15',
            snatch_rm: '75',
        },
        {
            id: '2',
            name: 'Sarah Connor',
            avatar_url: null,
            payment_status: 'active',
            cut_day: '15',
            referral_source: 'Referido',
            back_squat: '85',
            bench_press: '50',
            deadlift: '95',
            shoulder_press: '35',
            front_squat: '70',
            clean_rm: '65',
            push_press: '45',
            karen: '10:45',
            burpees_100: '9:30',
            snatch_rm: '55',
        },
        {
            id: '3',
            name: 'Mike Tyson',
            avatar_url: null,
            payment_status: 'pending',
            cut_day: '01',
            referral_source: 'Google',
            back_squat: '150',
            bench_press: '110',
            deadlift: '180',
            shoulder_press: '70',
            front_squat: '130',
            clean_rm: '115',
            push_press: '80',
            karen: '6:50',
            burpees_100: '5:45',
            snatch_rm: '95',
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
            insert: (rows: any[]) => {
                console.warn('Supabase not configured. Mock insert:', rows);
                if (table === 'athletes' && rows) {
                    const newRows = rows.map(r => ({ ...r, id: crypto.randomUUID() }));
                    inMemoryStore.athletes.push(...newRows as any);
                    return {
                        select: () => ({
                            single: () => Promise.resolve({ data: newRows[0] || null, error: null })
                        }),
                        then: (resolve: any) => resolve({ data: newRows, error: null })
                    };
                }
                return {
                    select: () => ({
                        single: () => Promise.resolve({ data: null, error: null })
                    }),
                    then: (resolve: any) => resolve({ data: null, error: null })
                };
            },
            update: (updates: any) => {
                console.warn('Supabase not configured. Mock update:', updates);
                return {
                    eq: (col: string, val: string) => {
                        const index = inMemoryStore.athletes.findIndex((a: any) => a[col] === val);
                        if (index !== -1) {
                            inMemoryStore.athletes[index] = { ...inMemoryStore.athletes[index], ...updates };
                        }
                        return Promise.resolve({ data: null, error: null });
                    }
                };
            },
            delete: () => ({
                eq: (col: string, val: string) => {
                    console.warn('Supabase not configured. Mock delete.');
                    const index = inMemoryStore.athletes.findIndex((a: any) => a[col] === val);
                    if (index !== -1) {
                        inMemoryStore.athletes.splice(index, 1);
                    }
                    return Promise.resolve({ data: null, error: null });
                }
            }),
            eq: (col: string, val: string) => ({
                select: () => {
                    const data = inMemoryStore.athletes.filter((a: any) => a[col] === val);
                    return Promise.resolve({ data, error: null });
                },
                then: (resolve: any) => resolve({ data: null, error: null })
            }),
            order: (col: string, options: any) => ({
                limit: (n: number) => {
                    let data = [...inMemoryStore.athletes];
                    // Very simple mock sorting
                    if (col === 'created_at') {
                        data.reverse();
                    }
                    return Promise.resolve({ data: data.slice(0, n), error: null });
                }
            }),
            upsert: (rows: any[]) => {
                console.warn('Supabase not configured. Mock upsert:', rows);
                rows.forEach(row => {
                    const index = inMemoryStore.athletes.findIndex((a: any) => a.id === row.id);
                    if (index !== -1) {
                        inMemoryStore.athletes[index] = { ...inMemoryStore.athletes[index], ...row };
                    } else {
                        inMemoryStore.athletes.push({ ...row, id: row.id || crypto.randomUUID() });
                    }
                });
                return Promise.resolve({ data: rows, error: null });
            }
        })
    } as any;
