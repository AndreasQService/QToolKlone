import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yxdoecdqttgdncgbzyus.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4ZG9lY2RxdHRnZG5jZ2J6eXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTE3OTIsImV4cCI6MjA4NjA4Nzc5Mn0.Jfl_mC9qzR06IaUL6fcD4sYWMoQP83ugVmKUG7r9VrQ'

const supabase = createClient(supabaseUrl, supabaseKey)

async function clearData() {
    console.log('Clearing all reports...')

    // Delete all rows
    const { error } = await supabase
        .from('reports')
        .delete()
        .neq('id', 'placeholder')

    if (error) {
        console.error('Error clearing data:', error)
    } else {
        console.log('Reports cleared successfully.')
    }
}

clearData()
