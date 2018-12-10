
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
    
        const addToArray = (key: string, res: string | null | GenericValidatorResult<T>) => {
            if(res === null)
                return;
    
            function innerAdd(key: string, res: string | null) {
                var current: any = result[key] || [];
                if(!current.errors)
                {
                    current.errors = [];
                }
    
                if(res !== null && current.indexOf(res) === -1){
                    current.errors.push(res);
                }
                
                result[key] = current;
            }
    
            if(isRecord(res)) {
                const r = res as any;
                for(var k in r){
                    if(k === key){
                        innerAdd(key, r);
                        return;
                    }
    
                    const isArray = Array.isArray((model as any)[k]);
                    if(isArray){
                        addToArray(k, r[k]);
                    }
                    add(k, r[k]);
                }
                return;
            }
            
            innerAdd(key, res as any);
        };
    
        const validators = this.getValidatorsFor<T>(target);
    
        for(const key in validators){
            if(!isInValidationPath(path + key, validationPath))
            {
                continue;
            }
            const propValue = (model as any)[key];
            const isArray = propValue instanceof Array;
            const propValidators = validators[key] as Array<FieldValidator | IValidator<T, Ctx>>;
            for(var i = 0; i < propValidators.length; i++){
                const v = propValidators[i];
                var res = isFieldValidator(v) ? v.validate(propValue) : v(model, ctx, originalModel);
                if(res instanceof Promise){
                    res = await res;
                }
                if(isArray){
                    addToArray(key, res);
                }
                else if(isPrimitive(propValue)) {
                    add(key, res);
                }
                else if(isTypedRecord(res) || isRecord(res)) {
                    add(key, res);
                }
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
                var arrayRes: any = result[key] || [];
                for(var k = 0; k < propValue.length; k++){
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
                
                let decodeResult = prop.decode(propValue);
                if(decodeResult.isLeft()){
                    PathReporter.report(decodeResult).forEach(o => add(key, o));
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

function hasKey(input: any, key: string) {
    if(isPrimitive(input))
    {
        return false;
    }

    if(key in input){
        return true;
    }

    return false;
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

function isRecord(input: any): boolean {
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