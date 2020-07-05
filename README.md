# masutaka-feed

## features

### github/

```
GitHub private feed -> IFTTT -> Amazon API Gateway -> AWS Lambda -(filter)-> Twitter
                                                                 -(filter)-> Pushover
```

### hatebu/

```
はてブのお気に入り feed -> IFTTT -> Amazon API Gateway -> AWS Lambda -> Twitter
```

## deployment

```
$ make deploy
```
