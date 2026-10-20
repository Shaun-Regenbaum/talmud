# Price only the request we send

The optional `pricingApplicability` contract supports one reviewed route: `google/gemini-2.5-flash-lite` through standard `google-ai-studio`. Old configurations keep their previous price checks.

The contract freezes the complete endpoint price table and declares plain text input, no tools, no plugins and no explicit caching. The request builder and reservation check enforce that shape. Content blocks, extra request fields, another model or provider, and changed fee tables are refused.

Image, audio and search prices do not apply to these requests. Explicit cache writes require cache-control content blocks, which the allowed request cannot contain. The documented implicit cache behavior has no write or storage cost. This exception does not apply to other models or routes.

Reasoning tokens must cost no more than the reserved output rate. Cache reads must cost no more than the reserved input rate. Unknown fee fields, nonfinite or negative prices, discounts and higher applicable rates are refused. Each attempt still reserves the full output limit and conservatively bounds input tokens from text bytes. Missing actual charges retain the reservation.

Sources:
- https://openrouter.ai/docs/guides/best-practices/prompt-caching
- https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- The public endpoint snapshot in `../tests/fixtures/text-pricing-endpoint.json`, captured 2026-10-20.

A configuration must also pass the existing independently reviewed plan, request hash and shared spending checks. This change does not dispatch work or increase any spending allowance.
