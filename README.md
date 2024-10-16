# masutaka-feed

[![Test](https://github.com/masutaka/masutaka-feed/actions/workflows/test.yml/badge.svg?branch=main)][Test]
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fmasutaka%2Fmasutaka-feed.svg?type=shield)][fossa]
[![Deploy - GitHub Actions](https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml/badge.svg?branch=main)][deploy]

[Test]: https://github.com/masutaka/masutaka-feed/actions/workflows/test.yml?query=branch%3Amain
[fossa]: https://app.fossa.com/projects/git%2Bgithub.com%2Fmasutaka%2Fmasutaka-feed?ref=badge_shield
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

## License

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fmasutaka%2Fmasutaka-feed.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fmasutaka%2Fmasutaka-feed?ref=badge_large)
