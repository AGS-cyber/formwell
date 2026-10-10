# Formwell

Static Formwell website for security-aware web app development. The selected light design includes a restrained CSS 3D scene and a three-step, copyable enquiry draft.

## Local preview

Serve `dist` using any static web server, for example:

```sh
python -m http.server 4180 --bind 127.0.0.1 --directory dist
```

There are no package dependencies or build commands.

## Cloudflare Pages

The `formwell` Pages project deploys automatically from this repository's `main` branch. Production is https://formwell.dev. Its generated alias is https://formwell-7ak.pages.dev. Automatic Git-triggered deployment and the production HTTPS domain have been verified.

Connect this GitHub repository using Cloudflare Pages Git integration. Use the `main` production branch, framework preset `None`, build command `exit 0`, root directory `/`, and build output directory `dist`. Each push to `main` can then deploy automatically. These settings follow the [Cloudflare static HTML guide](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/).

Add `formwell.dev` through the Pages project's Custom domains screen after the initial deployment. Inspect existing DNS records before changing any record. No Cloudflare API key belongs in this repository.

## Enquiries

The public business contact is `jason.ca721@gmail.com`, configured in `dist/config.js` and the JavaScript-free fallback in `dist/index.html`. The form prepares a safely encoded email draft and full copyable text. It does not transmit, store or send visitor answers. The visitor chooses whether to send in their own email app.

Reduced motion and JavaScript-free content/contact fallbacks are supported. The two public email links use Cloudflare's documented `email_off` comments so its Email Address Obfuscation does not break the JavaScript-free contact route. `_headers` supplies the existing static security policy without allowing extra scripts or connections.

## Search indexing

Production has the canonical URL `https://formwell.dev/`, a crawlable `robots.txt`, and a sitemap listing that URL. Its HTML does not contain `noindex`. Host-specific `X-Robots-Tag: noindex` headers keep the generated Pages alias and versioned deployment URLs out of search results.

The separate ChatGPT Sites demo retains its preview `noindex` metadata. It is not rebuilt or republished from this production checkout. These settings permit production indexing; search engines decide when to crawl and include it.

Only the selected Formwell site is included. No alternate demos or private review files are published.
