#!/bin/bash

# Create KV namespace for HebrewBooks cache
echo "Creating KV namespace for HebrewBooks cache..."
wrangler kv:namespace create "HEBREWBOOKS_KV"
wrangler kv:namespace create "HEBREWBOOKS_KV" --preview

echo "KV namespace created. Update the IDs in wrangler.toml with the output above."