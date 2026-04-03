import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()

        // 1. Get authenticated user
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Get user's role from profiles
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (profileError || !profile) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
        }

        // 3. Role check: only analyst and admin can create transactions
        if (profile.role === 'viewer') {
            return NextResponse.json({ error: 'Forbidden: viewers cannot create transactions' }, { status: 403 })
        }

        // 4. Parse and validate request body
        const body = await request.json()
        const { amount, type, category, date, description, idempotency_key } = body

        if (!amount || !type || !category || !date || !idempotency_key) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        if (type !== 'income' && type !== 'expense') {
            return NextResponse.json({ error: 'Type must be income or expense' }, { status: 400 })
        }

        // 5. Call the Postgres function
        const { data, error: rpcError } = await supabase.rpc('create_transaction', {
            p_user_id: user.id,
            p_amount: amount,
            p_type: type,
            p_category: category,
            p_date: date,
            p_description: description || null,
            p_idempotency_key: idempotency_key
        })

        if (rpcError) {
            console.error('RPC Error:', rpcError)
            return NextResponse.json({ error: 'Transaction failed', details: rpcError.message }, { status: 500 })
        }

        return NextResponse.json(data)

    } catch (err) {
        console.error('Unexpected error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}