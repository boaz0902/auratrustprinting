# AuraTrust Printing & Digital Services

A static, mobile-first business website built with HTML, CSS, vanilla JavaScript ES modules, and Tailwind CSS from its CDN. Supabase provides authentication, database access, order tracking, and private file storage. Vercel serves the static files; no build step or server-side secret is required.

## Run locally

Serve this folder over HTTP (ES modules do not work from `file://`). For example:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

On Windows, you can also double-click `start-local.bat`. It starts the static site on `http://127.0.0.1:8765/` and opens Chrome automatically. Keep the terminal window open while testing.

## Configure Supabase

1. In `js/config.js`, set `SUPABASE_URL` to the Supabase project URL and `SUPABASE_ANON_KEY` to the project's **public anon/publishable key**. These values are intended for browser use. Never put a `service_role` key in this project.
2. Update the contact details in `businessInfo` and the GCash name/number in `gcashInfo`. Replace `assets/gcash-qr.png` with the business QR code before accepting orders.
3. Use the existing `services`, `orders`, and `admins` tables, row-level security policies, `track_order` RPC, and private `order-files` bucket. This site does not create or alter the database schema.
4. In Supabase Authentication, enable **Anonymous Sign-Ins** for customers and **Email** sign-in for the owner.
5. Create the owner's email/password user in **Authentication → Users**, then authorize that user's Auth ID in the existing `admins` table using its preconfigured schema and policies.
6. Confirm RLS permits public reads only for visible services; authorized admins to manage services and orders; anonymous customers to upload into their own `{auth-user-id}/{order-id}/...` folder; and admins to read/delete order files. The private bucket's 25 MB file limit and accepted content types should match `js/config.js`.
7. The order tracker calls `track_order` with named arguments `p_order_number` and `p_mobile`. Confirm the existing RPC uses those names and returns the matching order number and status.

### Data used by the pages

- `services`: `id`, `name`, `category`, `description`, `unit`, `price`, `variants`, `popular`, `visible`, `sort_order`, `updated_at`.
- `orders`: `id`, `order_number`, `customer_id`, `customer_name`, `mobile`, `pickup_or_delivery`, `items`, `estimated_total`, `gcash_ref`, `receipt_path`, `status`, `terms_accepted_at`, `created_at`.
- `items` is JSON containing each original file name, private storage path, file metadata, and the selected print options.

If price loading fails or no visible service is available, the public price page and order form use the clearly identified placeholder services in `js/sample-data.js`. Replace those sample amounts before launch.

## Create and deploy the admin

1. Create an Auth user with a strong email/password in the Supabase dashboard.
2. Add its Auth user ID to the existing `admins` table as required by that table's schema and RLS setup.
3. Open `admin.html`, sign in, and use **Prices** to add and maintain services. The same dashboard has **Orders**, status updates, signed file links, and the 30-day file cleanup action.

## Deploy to Vercel

1. Push the project to a Git repository and import it in Vercel using the **Other** framework preset. No build command or output directory is needed.
2. Deploy the site as a static project.
3. In Supabase **Authentication → URL Configuration**, set the production Vercel URL as the Site URL and add it, plus any preview/local origins you use, to the Redirect URLs list.
4. Open the production domain and test the public price list, admin login, an anonymous customer order, and order tracking.

## Project map

- `index.html` — public price list, contact details, and business information.
- `order.html` — four-step file, preview/options, payment, and order flow.
- `track.html` — RPC-based order tracking.
- `admin.html` — email/password access, price management, and order management.
- `terms.html` / `privacy.html` — branded legal content pages.
- `js/config.js` — Supabase public settings, business/GCash details, and file limits.
- `js/supabase.js` — Supabase client and shared data/auth/storage helpers.
- `js/sample-data.js` — clearly identified fallback prices.
- `css/styles.css` — shared responsive styles and reduced-motion behavior.

Orders accept up to 10 print files, 25 MB each: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, JPG/JPEG, PNG, WebP, or TXT. The receipt screenshot must be a JPG, PNG, or WebP image and is stored alongside the order files.
