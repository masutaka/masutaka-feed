# masutaka-feed

## features

### github/

```
GitHub private feed -> IFTTT -> Amazon API Gateway -> AWS Lambda -(filter)-> Mastodon
                                                                 -(filter)-> Pushover
```

### hatebu/

```
はてブのお気に入り feed -> IFTTT -> Amazon API Gateway -> AWS Lambda -> Mastodon
```

## deployment

```
$ make deploy
```
