# Formwell

Static Formwell website for security-aware web app development. The selected light design includes a restrained CSS 3D scene and a three-step, copyable enquiry draft.

## Local preview

Serve `dist` using any static web server, for example:

```sh
python -m http.server 4180 --bind 127.0.0.1 --directory dist
```

There are no package dependencies or build commands.

## Cloudflare Pages

Connect this GitHub repository using Cloudflare Pages Git integration. Use the `main` production branch, framework preset `None`, build command `exit 0`, root directory `/`, and build output directory `dist`. Each push to `main` can then deploy automatically. These settings follow the [Cloudflare static HTML guide](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/).

Add `formwell.dev` through the Pages project's Custom domains screen after the initial deployment. Inspect existing DNS records before changing any record. No Cloudflare API key belongs in this repository.

## Enquiries

The public business contact is `jason.ca721@gmail.com`, configured in `dist/config.js` and the JavaScript-free fallback in `dist/index.html`. The form prepares a safely encoded email draft and full copyable text. It does not transmit, store or send visitor answers. The visitor chooses whether to send in their own email app.

Reduced motion and JavaScript-free content/contact fallbacks are supported. `_headers` supplies static security headers on compatible hosts. This release retains the demo's `noindex` metadata until the production domain is connected.

Only the selected Formwell site is included. No alternate demos or private review files are published.
