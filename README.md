Purpose:

Implement extremely complex validation rules against complicated data models in a straight forward manner.

Getting Started

    yarn add validator-inator io-ts-derive-class io-ts

Examples

Play with the below example here: [![Edit j4q8y0onz5](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/j4q8y0onz5)


```ts
    //This is used so that you can pass dependencies to validation functions
    //e.g. if you want to call a web service you could reference it here
    type MyValidationContext = {};

    const registry = new ValidationRegistry<MyValidationContext>();

    const AddressType = t.type({
        ID: t.number,
        StreetAddress1: t.string,
        City: t.string,
        State: t.string
    });

    class Address extends tdc.DeriveClass(AddressType) {}

    const PersonType = t.type({
        ID: t.number,
        FirstName: t.string,
        LastName: t.string,
        Email: t.union([t.string, t.null]),
        Phone: t.union([t.string, t.null]),
        Addresses: t.array(tdc.ref(Address))
    });

    class Person extends tdc.DeriveClass(PersonType) {}

    const mustHaveContactMethodValidator = (p: Person) => {
    const validResult = { Email: null, Phone: null, Addresses: null };
    if (p.Email !== null || p.Phone !== null || p.Addresses.length > 0) {
        return validResult;
    }

    const message =
        "A person must have an Email or a Phone or a Physical Address!";

        return { Email: message, Phone: message, Addresses: message };
    };

    registry.register(Person, {
        FirstName: required(),
        LastName: [required(), min(1)],
        Email: mustHaveContactMethodValidator,
        Phone: mustHaveContactMethodValidator,
        Addresses: mustHaveContactMethodValidator
    });

    let testPerson = new Person()
    let validationResult = await registry.validate(testPerson, {})
```
More examples and tests can be found in src/index.spec.ts

Contributing

    yarn install
    yarn run test 