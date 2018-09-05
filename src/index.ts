
import 'reflect-metadata'

import * as t from 'io-ts'
import * as tdc from 'io-ts-derive-class'
import { PathReporter } from 'io-ts/lib/PathReporter'
import * as moment from 'moment';

type primitive = string | number | boolean | null | undefined | moment.Moment;

function isPrimitive(input: any): input is primitive {
    return typeof input === "string"
        || typeof input === "boolean"
        || typeof input === "number"
        || input === null
        || input === undefined
        || moment.isMoment(input);
}

type ValidatorResult = string | null | Promise<string | null>;

const VALIDATION_METADATA_KEY = "VALIDATION_METADATA_KEY";

interface IValidator<T> {
    (model: T): ValidatorResult;
}

export abstract class FieldValidator {
    readonly tag: string = 'FieldValidator'
    abstract validate(value: any): ValidatorResult;
}

function isFieldValidator(input: any): input is FieldValidator {
    return input['tag'] === 'FieldValidator';
}

type ValidationModel<T> = {
    [P in keyof T]?: FieldValidator | IValidator<T> | Array<FieldValidator | IValidator<T>>;
}

type ValidatorEntryProps<T> = {
    [P in keyof T]?: Array<FieldValidator | IValidator<T>>;
}

function getValidatorsFor<T>(klass: new (...args: any[]) => T) : ValidatorEntryProps<T> {
    return Reflect.getMetadata(VALIDATION_METADATA_KEY, klass) as ValidatorEntryProps<T> || {};
}

type RequiredProps<T> = {
    [P in keyof T]: boolean;
}

export function getRequiredFieldsFor<T>(klass: new (...args: any[]) => T) : RequiredProps<T> {
    const classValidators = getValidatorsFor(klass);
    var res: any = {};
    for(var p in classValidators) {
        var required = false;
        var validators = classValidators[p];
        if(validators !== undefined){
            validators.forEach(v => {
                if(isRequiredFieldValidator(v)){
                    required = true;
                }
            })
        }
        
        res[p] = required;
    }

    return res;
}

class RequiredValidator extends FieldValidator {
    readonly isRequiredFieldValidator: boolean = true;
    constructor(public message: string) {
        super();
    }

    validate(value: any) {
        if(value === null || value === undefined){
            return this.message;
        }

        if(typeof value === "string" && value.length < 1){
            return this.message;
        }

        return null;
    }
}

function isRequiredFieldValidator(input: any): input is RequiredValidator {
    return input && input.isRequiredFieldValidator === true
}

class MinLengthValidator extends FieldValidator {
    constructor(public min: number, public message: string | null = null){
        super();
    }

    validate(value: any) {
        if(value === null || value === undefined){
            return null;
        }

        if(typeof value === "string"){
            if(value.length < this.min) {
                return this.message || 'must be at least ' + this.min + ' characters';
            }
        }

        if(typeof value === "number"){
            if(value < this.min){
                return this.message || 'must be greater than ' + this.min;
            }
        }

        return null;
    }
}

class MaxLengthValidator extends FieldValidator {
    constructor(public max: number, public message: string | null = null){
        super();
    }

    validate(value: any) {
        if(value === null || value === undefined){
            return null;
        }

        if(typeof value === "string"){
            if(value.length > this.max) {
                return this.message || 'must be fewer than ' + this.max + ' characters';
            }
        }

        if(typeof value === "number"){
            if(value < this.max){
                return this.message || 'must be less than ' + this.max;
            }
        }

        return null;
    }
}

export const required = (message: string = 'is required') => new RequiredValidator(message);
export const min = (min: number, message: string | null = null) => new MinLengthValidator(min, message);
export const max = (max: number, message: string | null = null) => new MaxLengthValidator(max, message);

export function register<T>(
    klass: new (...args: any[]) => T,
    map: ValidationModel<T>
): void  {
    const currentMap: any = getValidatorsFor<T>(klass);
    for(const prop in map) {
        const currentValidators = (currentMap[prop] || []) as Array<FieldValidator | IValidator<T>>;
        const mapped = map[prop];
        if(mapped instanceof Array){
            mapped.forEach(m => {
                currentValidators.push(m);
            });
        }
        else {
            currentValidators.push(mapped as any);
        }

        currentMap[prop] = currentValidators;
    }

    Reflect.defineMetadata(VALIDATION_METADATA_KEY, currentMap, klass);
}

type ValidationArray<T> = Array<T> & {
    errors: string[]
}

export type ValidationResult<T> = {
    [P in keyof T]: T[P] extends primitive ? string[] :
                    T[P] extends moment.Moment ? string[] :
                    T[P] extends Array<infer U> ? ValidationArray<ValidationResult<U>> :
                    ValidationResult<T[P]>;
}

function isInValidationPath(currentPath: string, validationPath: string | null): boolean {
    if(validationPath === null)
    {
        return true;
    }

    return validationPath.startsWith(currentPath);
}

export async function validate<T extends tdc.ITyped<any>>(model: T, validationPath: string | null = null, path: string = '.'): Promise<ValidationResult<T>> {
    const result: any = {};
    if(isPrimitive(model)){
        return result;
    }

    var target = model as any;
    target = target.prototype === undefined ? target.constructor : target;
    
    const add = (key: string, res: string | null) => {
        if(res === null)
            return;
        var current = result[key] || [];
        current.push(res);
        result[key] = current;
    };

    const addToArray = (key: string, res: string | null) => {
        if(res === null)
            return;
        
        var current: any = result[key] || [];
        if(!current.errors)
        {
            current.errors = [];
        }

        current.errors.push(res);
        result[key] = current;
    }

    const validators = getValidatorsFor<T>(target);

    for(const key in validators){
        if(!isInValidationPath(path + key, validationPath))
        {
            continue;
        }
        const propValue = model[key];
        const isArray = propValue instanceof Array;
        const propValidators = validators[key] as Array<FieldValidator | IValidator<T>>;
        for(var i = 0; i < propValidators.length; i++){
            const v = propValidators[i];
            var res = isFieldValidator(v) ? v.validate(model[key]) : v(model);
            if(res instanceof Promise){
                res = await res;
            }
            if(isArray){
                addToArray(key, res);
            }else {
                add(key, res);
            }
        }
    }

    const type = model.getType();
    const propKeys = Object.keys(type.props);
    for(var i = 0; i < propKeys.length; i++){
        const key = propKeys[i];
        if(!isInValidationPath(path + key, validationPath)) {
            continue;
        }
        const prop = type.props[key] as t.Type<any>;
        const tag = (prop as any)['_tag'];
        const tagContains = (search: string) => tag && tag.length > 0 ? tag.indexOf(search) != -1 : false;
        const propValue = (model as any)[key];
        const current = result[key];
        if(tag === "InterfaceType"){
            const innerResult = await validate(propValue, validationPath, path + key + '.');
            
            if(current){
                if(Object.keys(innerResult).length > 0){
                    result[key] = Object.assign(current, innerResult);
                }
            }
            else {
                result[key] = innerResult;
            }
        }
        else if(tagContains("ArrayType"))
        {
            var arrayRes: any = result[key] || [];
            for(var k = 0; k < propValue.length; k++){
                const item = propValue[k];
                const innerResult = await validate(item, validationPath, path + key + '[' + k + ']' + '.');
                arrayRes.push(innerResult);
            }
            
            if(!arrayRes.errors){
                arrayRes.errors = [];
            };
            result[key] = arrayRes;
        }
        else {
            if(!current){
                result[key] = [];
            }
            
            let decodeResult = prop.decode(propValue);
            if(decodeResult.isLeft()){
                PathReporter.report(decodeResult).forEach(o => add(key, o));
            }
        }
    }

    return result;
}