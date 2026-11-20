# EVNT OPS Kit

Check Evnt Inspirations kit in and out of the BTR production container (and later the hire warehouse), by order, from a phone.

- **Stock:** every item at a site, with what is in, booked, out, in repair or missing.
- **Orders:** each order makes a picking list and moves through Picking, Ready, Collected, Returned and Checked. Every move is logged with who and when.
- **Scanning:** phone-camera QR scanning, or type a label code. Scans are saved on the phone when there is no signal and sync when it comes back.
- **Labels:** print QR labels (`EVN-0001`, `EVN-0002`, …) for any or all items.
- **Admin:** every active order across sites, approve people and set roles, switch sites on and off, export everything as spreadsheets.

Built with React + Vite as an installable web app (PWA) on Supabase's free plan.

## Roles

| Role | Can do |
| --- | --- |
| Admin | Everything, including approving people, changing roles, overriding stages, marking items found or written off |
| Staff | Add kit, create orders, scan out and in, move orders through stages, add condition notes |
| Viewer | See stock and orders at all sites |
| Not approved | New sign-ups wait here until an admin approves them |

The **first person to sign up becomes admin**. Everyone after that waits for approval.

## One-time setup

1. **Supabase auth URLs.** In the Supabase dashboard for the `evntops` project, go to Authentication → URL Configuration. Set **Site URL** to `https://kit.evntops.co.uk` and add `https://kit.evntops.co.uk/**` under Redirect URLs. Without this, the sign-up confirmation email links to localhost.
2. **Host on Cloudflare Pages (free).** Create a Pages project connected to this GitHub repo. Build command `npm run build`, output directory `dist`. The Supabase URL and publishable key are in `.env.production`, so no environment variables are needed.
3. **Domain.** In the Pages project, add the custom domain `kit.evntops.co.uk`. Cloudflare shows the CNAME record to add at your domain registrar.
4. **Sign up first** at `https://kit.evntops.co.uk` so your account becomes admin, then approve the team under Admin.
5. **Labels.** Add kit under Stock → Add kit, then print from Labels on weatherproof vinyl sheets.

## Database

The schema lives in `supabase/migrations/` and is already applied to the `evntops` Supabase project. Row level security protects every table: only approved members can read, only staff can write, only admins can delete or change roles. Scans go through `record_scan()`, which ignores repeats of the same scan so offline retries are safe, and stage changes go through `set_order_status()`, which enforces the stage order.

## Free plan notes

- Supabase pauses a free project after about a week with no activity. Restore it from the Supabase dashboard if that happens.
- There are no automatic backups. Use Admin → Export everything once a month.
- Photos are shrunk to 1280px JPEGs before upload so the 1GB of storage lasts.

## Local development

```bash
npm install
npm run dev
```
