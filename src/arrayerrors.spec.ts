import { expect } from 'chai';
import 'mocha';

import * as t from 'io-ts';
import * as tdc from 'io-ts-derive-class';

import { ValidationRegistry, isValid, required, min } from './index'

type MyValidationContext = {};

const registry = new ValidationRegistry<MyValidationContext>();

const AddressType = t.type({
  ID: t.number,
  StreetAddress1: t.string,
  City: t.string,
  State: t.string
});

class Address extends tdc.DeriveClass(AddressType) {}

registry.register(Address, {
  StreetAddress1: required()
})

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
  if (p.Email !== null || p.Phone !== null || p.Addresses.length > 1) {
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

describe('Array errors', () => {
    it('Array with complex validation rules returns correct error shape', async () => {
        const person = new Person({
            FirstName: "Test",
            LastName: "Test",
            Addresses: [new Address()]
        });

        const personResult = await registry.validate(
            person,
            {}
        );

        expect(personResult.Addresses.length).eq(1)
        expect(personResult.Addresses.errors.length).eq(1)

        const personIsValid = isValid(personResult);
        expect(personIsValid).eq(false)
    })
});