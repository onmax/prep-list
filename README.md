# Prep List

Mobile-first checklist app for restaurant prep work. Single persistent list with PIN protection.

## Setup

```bash
pnpm install
cp .env.example .env  # Set PIN_CODE (default: 1234)
pnpm dev
```

## Features

- PIN auth (localStorage, 24h session)
- Single editable prep list
- Check items, click Save to persist
- Strikethrough for completed items
- Mobile-first Nuxt UI design

## Drawers

12 predefined drawers: Freezer, Tuna Tartar, Cheese, Tiramisu, Grilled Leak, Beef Tartar, Pumpkin, Potatoes, Truffle Pasta, Padrons, Bolognese, Cold Section

## Deploy

Deploy to NuxtHub. Set `PIN_CODE` env var.
