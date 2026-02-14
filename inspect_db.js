import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yxdoecdqttgdncgbzyus.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4ZG9lY2RxdHRnZG5jZ2J6eXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTE3OTIsImV4cCI6MjA4NjA4Nzc5Mn0.Jfl_mC9qzR06IaUL6fcD4sYWMoQP83ugVmKUG7r9VrQ'

const supabase = createClient(supabaseUrl, supabaseKey)

async function inspectData() {
    console.log('Checking reports count...')

    const { count, error: countError } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })

    if (countError) {
        console.error('Error counting:', countError)
        return
    }

    console.log(`Total rows in 'reports': ${count}`)

    if (count > 0) {
        const { data, error } = await supabase
            .from('reports')
            .select('id, content')
            .limit(3)

        if (error) {
            console.error('Error fetching sample:', error)
        } else {
            console.log('Sample data:', JSON.stringify(data, null, 2))
        }
    }
}

inspectData()
