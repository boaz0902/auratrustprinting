# AuraTrust Printing & Digital Services

A mobile-first static website built with HTML, CSS, vanilla JavaScript ES modules, and Tailwind CSS from its CDN. Vercel serves the site; Supabase provides authentication, the live service catalog, order records, and private file storage.

## Run locally

Serve this folder over HTTP (ES modules do not work from `file://`):

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`. On Windows, `start-local.bat` starts the site on `http://127.0.0.1:8765/`.

## Supabase setup

1. Set the public Supabase URL and publishable/anon key in `js/config.js`. Never put a service-role key in browser code.
2. Keep the existing `services`, `orders`, `admins`, and private `order-files` bucket. Public prices and the order guide both use visible rows in `services`; maintain prices in `admin.html`.
3. Apply `supabase/migrations/20261124_quote_request_flow.sql` to the existing database. It adds quote/contact fields, readable order references, the quote-creation and tracking RPCs, status timestamps, and storage-bucket file limits.
4. Configure `order-files` as a private bucket that allows uploads under `{auth-user-id}/{order-id}/...`; the migration removes MIME-type filtering and sets a 10 MB per-object limit. The site also caps a request at 10 files and 40 MB total in `js/config.js`.
5. Enable Supabase Anonymous Sign-Ins for customers and Email sign-in for the owner. Keep the existing admin-only read/update policies for orders and storage. The quote RPC verifies the authenticated customer ID and uploaded file paths.
6. Make sure `services` permits public reads only for visible rows and the admin account is authorized in `admins`.

The order wizard accepts any file extension. `fileTypeCategories` in `js/config.js` is the single extension-to-category map; unknown extensions receive the custom-job guide. Service names, variants, and prices come from Supabase. Missing catalog prices display **Staff will quote**. Every estimate is informational; staff sets the final price in Admin.

## Configure automatic file cleanup

The cleanup Edge Function deletes files only after an order has remained **Completed** or **Cancelled** for the configured retention period. It preserves the order row and selections while clearing the file storage paths. The default is 30 days.

1. Deploy `supabase/functions/cleanup-order-files/index.ts` with the Supabase CLI:

   ```powershell
   supabase functions deploy cleanup-order-files --no-verify-jwt
   supabase secrets set FILE_RETENTION_DAYS=30
   ```

   Set `FILE_RETENTION_DAYS` to a whole number from 1 to 3650 to change the retention period.
2. In Supabase, enable the Cron, Net, and Vault extensions. Store the service-role key in Vault (never in the repository or Vercel):

   ```sql
   select vault.create_secret('<service-role-key>', 'order_cleanup_service_role_key');
   ```
3. Create a daily Cron job (for example, 03:15 UTC) that invokes the function using the secret stored in Vault:

   ```sql
   select cron.schedule(
     'delete-order-files-daily',
     '15 3 * * *',
     $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/cleanup-order-files',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (
           select decrypted_secret
           from vault.decrypted_secrets
           where name = 'order_cleanup_service_role_key'
         )
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```

   Do not put the key in this file or commit it.

The function responds with the number of orders processed and files deleted. Review its Edge Function logs periodically.

## Admin and weekly order export

Open `admin.html` and sign in with the authorized owner account. The Orders tab shows customer contact details, service selections, order notes, estimates, and time-limited download links. Staff can set the final price, add an internal note, copy a ready-to-send message, and move orders through New, Quoted, Awaiting payment, Paid, Printing, Ready for pickup, Completed, or Cancelled.

Use **Export CSV** from the Orders tab once a week and keep the downloaded file with business records. Do not store exports in a publicly accessible folder.

## Free-tier reliability

Supabase Free projects can pause after a period of inactivity. A scheduled keep-alive ping is not a dependable substitute for a production plan. Check the project and backups regularly, keep a weekly CSV export, and use a paid Supabase plan if the order service must remain continuously available.

## Deploy to Vercel

1. Import the repository in Vercel using the **Other** framework preset. No build command or output directory is required.
2. Set the production site URL in Supabase Authentication → URL Configuration and allow the production and local origins.
3. Test the public price list, order request, admin workflow, file cleanup schedule, and order tracking against a staging Supabase project before switching customers to the new flow.

## Project map

- `index.html` — public price list and business information.
- `order.html` — four-step quote request (upload, services, details, done).
- `track.html` — order reference and contact-number tracking.
- `admin.html` — price management and order/quote management.
- `js/config.js` — browser-safe Supabase settings, file limits, and extension categories.
- `js/supabase.js` — shared auth, price, storage, and order helpers.
- `supabase/migrations/20261124_quote_request_flow.sql` — quote workflow schema and RPCs.
- `supabase/functions/cleanup-order-files/` — scheduled file-retention function.
