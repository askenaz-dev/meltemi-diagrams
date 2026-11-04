# Shop architecture

Some prose that is not a diagram.

## Checkout flow

```mermaid
flowchart LR
  cart[Cart] --> pay{Paid?}
  pay -->|yes| done[Done]
```

## Payment

```plantuml
@startuml
Alice -> Bob : pay
Bob --> Alice : receipt
@enduml
```

```js
console.log("not a diagram");
```

## Classes

```mermaid
classDiagram
  A <|-- B
```

## Checkout flow

~~~puml
[Cart] --> [Payment]
~~~
