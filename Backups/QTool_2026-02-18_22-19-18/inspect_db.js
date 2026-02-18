
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yxdoecdqttgdncgbzyus.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4ZG9lY2RxdHRnZG5jZ2J6eXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTE3OTIsImV4cCI6MjA4NjA4Nzc5Mn0.Jfl_mC9qzR06IaUL6fcD4sYWMoQP83ugVmKUG7r9VrQ'

const supabase = createClient(supabaseUrl, supabaseKey)

async function inspectData() {
    console.log('Checking Supabase connection...')

    // Check Tables
    const { data: tables, error: tableError } = await supabase
        .from('damage_reports')
        .select('*')
        .limit(1);

    if (tableError) console.error('Error fetching tables:', tableError);
    else console.log('Tables check: damage_reports exists.')

    // Check Buckets
    // Note: listBuckets is usually an administrative function
    // But let's try via storage API
    const { data: buckets, error: bucketError } = await supabase
        .storage
        .listBuckets();

    if (bucketError) {
        console.error('Error fetching buckets (rls or missing):', bucketError);
    } else {
        console.log('Buckets found:', buckets ? buckets.map(b => b.name) : 'None');
        const damageImages = buckets ? buckets.find(b => b.name === 'damage-images') : null;
        if (damageImages) {
            console.log('✅ Bucket "damage-images" exists.');
            console.log('   Public:', damageImages.public);
        } else {
            console.error('❌ Bucket "damage-images" NOT found. Images will NOT upload properly.');
        }
    }
}

inspectData()
