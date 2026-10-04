'use client';
import { Children, isValidElement, useId, useState, type ChangeEvent, type ComponentProps } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Adapt form values to the existing Radix primitives; the empty choice remains unknown.
export function Choice({ children, value, defaultValue, onChange, name, required, ...props }: ComponentProps<'select'>) {
  const options = Children.toArray(children).filter(isValidElement).map(child => child.props as { value: string; children: React.ReactNode });
  const initial = String(defaultValue ?? options[0]?.value ?? '');
  const [internal, setInternal] = useState(initial);
  const selected = value === undefined ? internal : String(value);
  const id = useId();
  return <><Select value={selected || '__unknown__'} onValueChange={next => { const canonical = next === '__unknown__' ? '' : next; setInternal(canonical); onChange?.({ target: { value: canonical }, currentTarget: { value: canonical } } as ChangeEvent<HTMLSelectElement>); }} disabled={props.disabled}><SelectTrigger id={props.id || id} className="choice-trigger" aria-required={required} aria-label={props['aria-label']}><SelectValue /></SelectTrigger><SelectContent position="popper">{options.map(option => <SelectItem key={option.value || '__unknown__'} value={option.value || '__unknown__'}>{option.children}</SelectItem>)}</SelectContent></Select>{name && <input type="hidden" name={name} value={selected} />}</>;
}
export function CheckBox({ checked, defaultChecked, onChange, name, required, disabled }: ComponentProps<'input'>) {
  return <Checkbox name={name} checked={checked} defaultChecked={defaultChecked} required={required} disabled={disabled} className="form-checkbox" onCheckedChange={next => onChange?.({ target: { checked: next === true }, currentTarget: { checked: next === true } } as ChangeEvent<HTMLInputElement>)} />;
}
