# Mfaro Software

Official website for Mfaro Software, featuring MfaroInvoice, MfaroPOS, MfaroEdu, MfaroBooking, and MfaroForex.

## Website

This is a static website built with HTML, CSS, and JavaScript. No installation or build step is required.

- `index.html` — website content
- `style.css` — responsive styles and brand colour tokens
- `app.js` — product previews, product dialogs, and software finder
- `.nojekyll` — serve the website as static files on GitHub Pages

## Local preview

Serve this directory using any static HTTP server, then open its local URL.

## GitHub Pages

In **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/ (root)**, then save. Private repositories require an eligible GitHub plan. Repository visibility should be changed only by the owner’s explicit instruction.

The project-site address, once Pages is enabled, is `https://andrewmadume.github.io/MfaroSoftware/`.

Product dashboards contain illustrative sample data and are not live product applications.

## Contact page

Visit [Contact Mfaro Software](https://andrewmadume.github.io/MfaroSoftware/contact.html) for email, WhatsApp, and phone links. The contact form validates a maximum combined upload size of 5 MB.

**Automatic submission is not configured yet.** The form displays this clearly and keeps submission disabled until a working backend is connected. API secrets must never be added to browser code.

The prepared server code and provider instructions are in `contact-service/SETUP.txt`. It is not deployed by GitHub Pages. Full messages and attachments are prepared for email; WhatsApp receives a notification and message excerpt. Resend and Twilio accounts, a verified sender, approved WhatsApp template, and a separately hosted public backend are still required.
