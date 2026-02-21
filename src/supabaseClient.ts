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
            access_code: 'JD-1234'
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
            access_code: 'SC-5678'
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
            access_code: 'MT-9012'
        }
    ],
    athlete_progress: [
        { id: 'h1', athlete_id: '1', field_name: 'back_squat', value: '110', created_at: '2024-01-01T10:00:00Z' },
        { id: 'h2', athlete_id: '1', field_name: 'back_squat', value: '115', created_at: '2024-01-15T10:00:00Z' },
        { id: 'h3', athlete_id: '1', field_name: 'back_squat', value: '120', created_at: '2024-02-01T10:00:00Z' },
    ]
}

// Check if variables are set and look like real URLs/Keys
const isConfigured = supabaseUrl && supabaseUrl.startsWith('http') && supabaseAnonKey;

export const supabase = isConfigured
    ? createClient(supabaseUrl, supabaseAnonKey)
    : {
        from: (table: string) => {
            const getTable = () => (inMemoryStore as any)[table] || [];

            return {
                select: (query?: string) => {
                    console.warn(`Supabase not configured. Mock select on ${table}.`);
                    return Promise.resolve({ data: getTable(), error: null })
                },
                insert: (rows: any[]) => {
                    console.warn(`Supabase not configured. Mock insert on ${table}:`, rows);
                    const newRows = rows.map(r => ({
                        ...r,
                        id: crypto.randomUUID(),
                        created_at: new Date().toISOString()
                    }));
                    getTable().push(...newRows);
                    return {
                        select: () => ({
                            single: () => Promise.resolve({ data: newRows[0] || null, error: null })
                        }),
                        then: (resolve: any) => resolve({ data: newRows, error: null })
                    };
                },
                update: (updates: any) => ({
                    eq: (col: string, val: string) => {
                        console.warn(`Supabase not configured. Mock update on ${table}:`, updates);
                        const data = getTable();
                        const index = data.findIndex((a: any) => a[col] === val);
                        if (index !== -1) {
                            data[index] = { ...data[index], ...updates };
                        }
                        return Promise.resolve({ data: null, error: null });
                    }
                }),
                delete: () => ({
                    eq: (col: string, val: string) => {
                        console.warn(`Supabase not configured. Mock delete on ${table}.`);
                        const data = getTable();
                        const index = data.findIndex((a: any) => a[col] === val);
                        if (index !== -1) {
                            data.splice(index, 1);
                        }
                        return Promise.resolve({ data: null, error: null });
                    }
                }),
                eq: (col: string, val: string) => ({
                    select: () => {
                        const data = getTable().filter((a: any) => a[col] === val);
                        return Promise.resolve({ data, error: null });
                    },
                    order: (orderCol: string, options: any) => ({
                        then: (resolve: any) => {
                            let data = getTable().filter((a: any) => a[col] === val);
                            if (options?.ascending === false) data.reverse();
                            return resolve({ data, error: null });
                        }
                    }),
                    then: (resolve: any) => {
                        const data = getTable().filter((a: any) => a[col] === val);
                        return resolve({ data, error: null });
                    }
                }),
                order: (col: string, options: any) => ({
                    limit: (n: number) => {
                        let data = [...getTable()];
                        if (col === 'created_at') data.reverse();
                        return Promise.resolve({ data: data.slice(0, n), error: null });
                    }
                }),
                upsert: (rows: any[]) => {
                    console.warn(`Supabase not configured. Mock upsert on ${table}:`, rows);
                    rows.forEach(row => {
                        const data = getTable();
                        const index = data.findIndex((a: any) => a.id === row.id);
                        if (index !== -1) {
                            data[index] = { ...data[index], ...row };
                        } else {
                            data.push({ ...row, id: row.id || crypto.randomUUID() });
                        }
                    });
                    return Promise.resolve({ data: rows, error: null });
                }
            };
        }
    } as any;
