'use client';
import type {FeatureKey} from '@/lib/accounts/plan';
import {isDemoConfigurator,useConfiguratorPresets} from '@/lib/configurator-presets';
import {FEATURE_TOOL,toolSample,type ToolSample} from '@/lib/tool-samples';

// One tool's picture, for a page about that tool (the plan-upgrade page): the
// same fixed picture as its Home card (lib/tool-samples.ts), never its latest
// work. Until the cars arrive the box keeps its shape with the placeholder.
export function useToolSample(feature:FeatureKey):ToolSample{
 const cars=useConfiguratorPresets().filter(c=>!isDemoConfigurator(c));
 return toolSample(FEATURE_TOOL[feature],cars);
}
