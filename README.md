# masutaka-feed

[![Deploy - GitHub Actions](https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml/badge.svg?branch=main)][deploy]

[deploy]: https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml?query=branch%3Amain

## features

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

## deployment

Every push to the `main` branch will deploy SAM Applications.
