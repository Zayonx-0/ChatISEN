export const targets=['app-a','app-b','sfu-1','sfu-2','coturn','supervision'] as const;
export type Target=typeof targets[number];
export const isTarget=(value:unknown):value is Target=>targets.some(target=>target===value);
export const peers:Partial<Record<Target,Target>>={'app-a':'app-b','app-b':'app-a','sfu-1':'sfu-2','sfu-2':'sfu-1'};
export type Health='healthy'|'down'|'unknown';
export type Vm={name:string;zone:string};
export type Inventory=Partial<Record<Target,Vm>>;
export const vmName=/^[a-z][a-z0-9-]{0,62}$/;
