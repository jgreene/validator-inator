
import 'reflect-metadata'

import * as t from 'io-ts'
import * as tdc from 'io-ts-derive-class'
import { PathReporter } from 'io-ts/lib/PathReporter'

type primitive = string | number | boolean | null | undefined | Date;

function isPrimitive(input: any): input is primitive {
    return typeof input === "string"
        || typeof input === "boolean"
        || typeof input === "number"
        || input === null
        || input === undefined
        || input instanceof Date
}

type ValidatorResult = string | null | Promise<string | null>;

type GenericValidatorResult<T> = {
    [P in keyof T]?:  T[P] extends primitive ? ValidatorResult
                    : T[P] extends Array<infer U> ? ValidatorResult
                    : never;
}

interface IValidator<T, Ctx> {
    (model: T, ctx: Ctx, originalModel?: T): ValidatorResult | GenericValidatorResult<T>;
}

interface IGenericValidator<T, Ctx> {
    (model: T, ctx: Ctx,  originalModel?: T): GenericValidatorResult<T>;
}

export abstract class FieldValidator {
    readonly tag: string = 'FieldValidator'
    abstract validate(value: any): ValidatorResult;
}

function isFieldValidator(input: any): input is FieldValidator {
    return input['tag'] === 'FieldValidator';
}

export type ValidationModel<T, Ctx> = {
    [P in keyof T]?:   T[P] extends primitive ? FieldValidator | IValidator<T, Ctx> | Array<FieldValidator | IValidator<T, Ctx>>
                     : T[P] extends Array<infer U> ? FieldValidator | IValidator<T, Ctx> | Array<FieldValidator | IValidator<T, Ctx>>
                     : IGenericValidator<T, Ctx> | Array<IGenericValidator<T, Ctx>>;
}

type ValidatorEntryProps<T, Ctx> = {
    [P in keyof T]?: Array<FieldValidator | IValidator<T, Ctx>>;
}

type RequiredProps<T> = {
    [P in keyof T]: boolean;
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

        if(value.length < 1) {
            return this.message
        }

        return null;
    }
}

function isRequiredFieldValidator(input: any): input is RequiredValidator {
    return input && input.isRequiredFieldValidator === true
}

class MinValidator extends FieldValidator {
    constructor(public min: number, public message: string | null = null){
        super();
    }

    validate(value: any) {
        if(value === null || value === undefined){
            return null;
        }

        if(value.length < this.min) {

            if(this.message) {
                return this.message
            }

            if(typeof value === 'string'){
                return 'must be at least ' + this.min + ' characters';
            }

            if(Array.isArray(value)){
                return 'must have at least ' + this.min + ' entries';
            }
        }

        if(value < this.min){
            return this.message || 'must be greater than ' + (this.min - 1);
        }

        return null;
    }
}

class MaxValidator extends FieldValidator {
    constructor(public max: number, public message: string | null = null){
        super();
    }

    validate(value: any) {
        if(value === null || value === undefined){
            return null;
        }

        if(value.length > this.max) {
            if(this.message){
                return this.message;
            }
            
            if(typeof value === 'string'){
                return 'must be fewer than ' + (this.max + 1) + ' characters';
            }

            if(Array.isArray(value)){
                return 'must be fewer than ' + (this.max + 1) + ' entries';
            }
        }

        if(value > this.max){
            return this.message || 'must be less than ' + (this.max + 1);
        }

        return null;
    }
}

export const required = (message: string = 'is required') => new RequiredValidator(message);
export const min = (min: number, message: string | null = null) => new MinValidator(min, message);
export const max = (max: number, message: string | null = null) => new MaxValidator(max, message);

type ValidationArray<T> = Array<T> & {
    errors: string[]
}

export interface IValidationRegistry<Ctx> {
    register<T>(
        klass: new (...args: any[]) => T,
        map: ValidationModel<T, Ctx>
    ): void

    validate<T extends tdc.ITyped<any>>(
        model: T, 
        ctx: Ctx,
        originalModel?: T | undefined,
        validationPath?: string | null, 
        path?: string
        ): Promise<ValidationResult<T>>

    getRequiredFieldsFor<T>(klass: new (...args: any[]) => T) : RequiredProps<T>
}

export class ValidationRegistry<Ctx> implements IValidationRegistry<Ctx> {
    public readonly map: Map<any, any> = new Map();

    getValidatorsFor<T>(klass: new (...args: any[]) => T) : ValidatorEntryProps<T, Ctx> {
        return this.map.get(klass) as ValidatorEntryProps<T, Ctx> || {};
    }

    public register<T>(
        klass: new (...args: any[]) => T,
        map: ValidationModel<T, Ctx>
    ): void  {
        const currentMap: any = this.getValidatorsFor<T>(klass);
        for(const prop in map) {
            const currentValidators = (currentMap[prop] || []) as Array<FieldValidator | IValidator<T, Ctx> | IGenericValidator<T, Ctx>>;
            const mapped = map[prop];
            if(mapped instanceof Array){
                let m = mapped as any[];
                m.forEach(m => {
                    currentValidators.push(m);
                });
            }
            else {
                currentValidators.push(mapped as any);
            }
    
            currentMap[prop] = currentValidators;
        }

        this.map.set(klass, currentMap);
    }

    public async validate<T extends tdc.ITyped<any>>(
        model: T, 
        ctx: Ctx,
        originalModel: T | undefined = undefined, 
        validationPath: string | null = null, 
        path: string = '.'
    ): Promise<ValidationResult<T>> {
    
        const result: any = {};
        if(isPrimitive(model)){
            return result;
        }
    
        var target = model as any;
        target = target.prototype === undefined ? target.constructor : target;
        
        function add(key: string, res: string | null | GenericValidatorResult<T>){
            const keyIsArray = Array.isArray((model as any)[key]);
            if(keyIsArray) {
                addToArray(key, res)
                return;
            }

            if(isRecord(res)){
                const r = res as any;
                for(var k in r){
                    add(k, r[k]);
                }
                return;
            }
    
            var current = result[key] || [];
            if(res !== null && current.indexOf(res) === -1){
                current.push(res);
            }
            
            result[key] = current;
        };
    
        function addToArray(key: string, res: string | null | GenericValidatorResult<T>) {
            if(res === null)
                return;
    
            function innerAdd(key: string, res: string | null) {
                var current: any = result[key] || [];
                if(!current.errors)
                {
                    current.errors = [];
                }

                result[key] = current;

                if(res === null){
                    return;
                }

                if(typeof res !== 'string'){
                    throw new Error('Not a valid error string!')
                }
    
                if(current.errors.indexOf(res) === -1){
                    current.errors.push(res);
                }
            }

            if(typeof res === 'string'){
                innerAdd(key, res);
                return;
            }
    
            if(isRecord(res)) {
                const r = res as any;
                for(var k in r){
                    const isArray = Array.isArray((model as any)[k]);
                    if(isArray){
                        addToArray(k, r[k]);
                    }
                    else if(k === key){
                        innerAdd(k, r[k]);
                        return;
                    }
                    else {
                        add(k, r[k]);
                    }
                }
                return;
            }
        };
    
        const validators = this.getValidatorsFor<T>(target);
    
        for(const key in validators){
            if(!isInValidationPath(path + key, validationPath))
            {
                continue;
            }
            const propValue = (model as any)[key];
            const propValidators = validators[key] as Array<FieldValidator | IValidator<T, Ctx>>;
            for(var i = 0; i < propValidators.length; i++){
                const v = propValidators[i];
                var res = isFieldValidator(v) ? v.validate(propValue) : v(model, ctx, originalModel);
                if(res instanceof Promise){
                    res = await res;
                }

                add(key, res);
            }
        }
    
        if(!model.getType) {
            return result;
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
            const originalValue = hasKey(originalModel, key) ? (originalModel as any)[key] : undefined;
            const current = result[key];
            
            if(tag === "InterfaceType" || isTypedRecord(propValue)){
                const innerResult = await this.validate(propValue, ctx, originalValue, validationPath, path + key + '.');
                
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
                const arrayRes: any = result[key] || [];
                for(let k = 0; k < propValue.length; k++){
                    const item = propValue[k];
                    const originalItem = originalValue !== undefined && originalValue.length > k ? originalValue[k] : undefined;
                    const innerResult = await this.validate(item, ctx, originalItem, validationPath, path + key + '[' + k + ']' + '.');
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
                
                const decodeResult = prop.decode(propValue);
                if(decodeResult.isLeft()){
                    PathReporter.report(decodeResult).forEach((o) => add(key, o));
                }
            }
        }
    
        return result;
    }

    public getRequiredFieldsFor<T>(klass: new (...args: any[]) => T) : RequiredProps<T> {
        const classValidators = this.getValidatorsFor<T>(klass);
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
}

export function isValidationArray<T>(input: any): input is ValidationArray<T> {
    return Array.isArray(input) && Array.isArray((input as any).errors);
}

export type ValidationResult<T> = {
    [P in keyof T]: T[P] extends primitive ? string[] :
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

export function isValid<T>(result: ValidationResult<T>): boolean {
    var res = true;
    for(var p in result){
        const prop: any = result[p];
        const isArray = Array.isArray(prop)
        const keys = isArray ? [] : Object.keys(prop);
        if(isArray){
            if(isValidationArray<T>(prop)){
                if(prop.errors.length > 0){
                    return false;
                }

                for(var i = 0; i < prop.length; i++){
                    const entry = prop[i];
                    if(!isValid(entry))
                    {
                        return false;
                    }
                }
            }
            else if(prop.length > 0)
            {
                return false;
            }
        }
        else if(keys.length > 0){
            if(!isValid(prop))
            {
                return false;
            }
        }
    }

    return res;
}

function hasKey(input: any, key: string): boolean {
    if(isPrimitive(input))
    {
        return false;
    }

    return key in input;
}

function isTypedRecord(input: any): boolean {
    if(isPrimitive(input)){
        return false;
    }

    if(Array.isArray(input)){
        return false;
    }

    if(input.getType){
        return true
    }

    return false;
}

function isRecord(input: any): input is object {
    if(isPrimitive(input)){
        return false;
    }

    if(Array.isArray(input)){
        return false;
    }

    if(Object.keys(input).length > 0)
    {
        return true;
    }

    return false;
}

export const _privates = {
    isPrimitive,
    isInValidationPath,
    hasKey,
    isTypedRecord,
    isRecord
}