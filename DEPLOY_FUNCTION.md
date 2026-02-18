# Deploying the Extraction Function

To make the AI extraction work, you need to deploy the Supabase Edge Function.

## Prerequisites
1.  **Supabase CLI**: Ensure you have the Supabase CLI installed.
    -   `npm install -g supabase` regarding https://supabase.com/docs/guides/cli

2.  **Login**:
    -   Run `npx supabase login` and follow the instructions.

## Deployment Steps

1.  **Deploy the Function**:
    Run the following command in your terminal (from the project root `c:\QTool`):
    ```bash
    npx supabase functions deploy extract --no-verify-jwt
    ```
    *(Note: `--no-verify-jwt` is optional but useful if you are calling it from the client without a session user initially, although we set up RLS for authenticated users, the function itself is server-side)*.
    **Better:** Since we use RLS, just `npx supabase functions deploy extract`.

2.  **Set Environment Variables**:
    The function needs access to Supabase Service Role Key (for storage/db items) and OpenAI API Key.
    
    Go to your **Supabase Dashboard** -> **Edge Functions** -> **extract** -> **Helper** or **Secrets**.
    
    Or set them via CLI:
    ```bash
    npx supabase secrets set OPENAI_API_KEY=sk-...your-key...
    npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...your-service-role-key...
    ```
    *Note: `SUPABASE_URL` and `SUPABASE_ANON_KEY` are usually auto-injected, but `SUPABASE_SERVICE_ROLE_KEY` might need to be explicit if using specific client creation, OR just use the default `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` which is available in deployed functions.*

## Verify
Once deployed, the `UploadPanel` in your app will trigger this function after uploading a file. You can check the **Logs** in the Supabase Dashboard under Edge Functions to see the execution output.
