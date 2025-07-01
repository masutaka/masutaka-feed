# masutaka-feed

[![Test](https://github.com/masutaka/masutaka-feed/actions/workflows/test.yml/badge.svg?branch=main)][Test]
[![Deploy - GitHub Actions](https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml/badge.svg?branch=main)][deploy]

[Test]: https://github.com/masutaka/masutaka-feed/actions/workflows/test.yml?query=branch%3Amain
[deploy]: https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml?query=branch%3Amain

## Features

### github/

```mermaid
graph TD
    A[GitHub private feed] --> B[IFTTT Pro]
    B --> C[Amazon API Gateway]
    C --> D[AWS Lambda]
    D -->|filter| E[Mastodon]
    D -->|filter| F[Pushover]
```

### hatebu/

```mermaid
graph TD
    A[はてブのお気に入り feed] --> B[IFTTT Pro]
    B --> C[Amazon API Gateway]
    C --> D[AWS Lambda]
    D --> E[Mastodon]
```

## Deployment

Every push to the `main` branch will deploy SAM Applications.
