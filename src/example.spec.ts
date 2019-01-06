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

describe('Can validate example', () => {
    it('returning parent record to child array results in no errors', async () => {
        const validPerson = new Person({
            FirstName: "Test",
            LastName: "Test",
            Email: "test@test.com"
        });

        const validPersonResult = await registry.validate(
            validPerson,
            {}
        );

        const validPersonIsValid = isValid(validPersonResult);
        expect(validPersonIsValid).eq(true)
    })
});