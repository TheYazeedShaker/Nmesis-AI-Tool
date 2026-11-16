// The configurator behind one adapter (Phase 3 group 2). The admin is building
// a remote-control mode for the configurator iframe (`?mode=remote`, the
// protocol in the NMESIS repository's docs/remote-control.md, not ready yet).
// The editor talks only to this interface, which has the protocol's functions;
// today's adapter drives the in-iframe capture flow. Switching to remote
// control later is a new adapter, with no editor changes.

export type ConfiguratorChoice={id:string;name:string;/** A colour's swatch, from the configurator. */swatch?:string};
export type ConfiguratorOptions={
 colours:ConfiguratorChoice[];
 trims:ConfiguratorChoice[];
 views:ConfiguratorChoice[];
 /** Frames of a 360° turn (0 when the configurator has none). */
 frames:number;
};
export type ConfiguratorState={colour?:string;trim?:string;view?:string;frame?:number};
export type Capture={blob:Blob;width:number;height:number;state:ConfiguratorState};

export interface ConfiguratorAdapter{
 /** What this car offers. Empty lists when the configurator cannot say (today's iframe). */
 getOptions():Promise<ConfiguratorOptions>;
 setColour(id:string):Promise<void>;
 setTrim(id:string):Promise<void>;
 setView(id:string):Promise<void>;
 setFrame(frame:number):Promise<void>;
 /** The car as it is shown now, as a picture. */
 capture():Promise<Capture>;
 /** Whether the person sets colour, trim and view inside the configurator itself (today) or the editor does (remote control). */
 readonly controlsInEditor:boolean;
 dispose():void;
}

// Nothing a person types is sent to the configurator: ids come only from
// getOptions(), and the adapter checks them against it.
export const knownChoice=(list:ConfiguratorChoice[],id:string)=>list.some(c=>c.id===id);
