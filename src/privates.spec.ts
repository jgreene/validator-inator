import { expect } from 'chai';
import 'mocha';

import * as t from 'io-ts'
import * as m from 'io-ts-derive-class'

import { _privates } from './index'

const { isPrimitive, hasKey, isTypedRecord, isRecord } = _privates

describe('Private method tests', () => {
    it('isPrimitive boolean', async () => {
        expect(isPrimitive(true)).eq(true)
        expect(isPrimitive(false)).eq(true)
    })

    it('isPrimitive number', async () => {
        expect(isPrimitive(1)).eq(true)
        expect(isPrimitive(0)).eq(true)
        expect(isPrimitive(-1)).eq(true)
    })

    it('hasKey', async () => {
        expect(hasKey({ key: true}, 'key')).eq(true)
        expect(hasKey({}, 'key')).eq(false)
        expect(hasKey(true, 'key')).eq(false)
    })

    it('isTypedRecord', async () => {
        const PersonAddressType = t.type({
            StreetAddress1: t.string,
            StreetAddress2: t.string,
        })
        
        class PersonAddress extends m.DeriveClass(PersonAddressType) {}

        const address = new PersonAddress()
        expect(isTypedRecord(address)).eq(true)
        expect(isTypedRecord({})).eq(false)
        expect(isTypedRecord([])).eq(false)
        expect(isTypedRecord(false)).eq(false)

        const typedArray: any = []
        typedArray.getType = () => { return true }
        expect(isTypedRecord(typedArray)).eq(false)
    })

    it('isRecord', async () => {
        const PersonAddressType = t.type({
            StreetAddress1: t.string,
            StreetAddress2: t.string,
        })
        
        class PersonAddress extends m.DeriveClass(PersonAddressType) {}

        const address = new PersonAddress()
        expect(isRecord(address)).eq(true)
        expect(isRecord({})).eq(false)
        expect(isRecord([])).eq(false)
        expect(isRecord(false)).eq(false)

        const typedArray: any = []
        typedArray.getType = () => { return true }
        expect(isRecord(typedArray)).eq(false)
    })
})