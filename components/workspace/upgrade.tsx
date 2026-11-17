'use client';
import * as React from 'react';
import Link from 'next/link';
import {Clapperboard,Film,Hourglass,ImageIcon,Layers,Lock,MessageCircle,Replace,Sparkles} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Badge} from '@/components/ds/feedback';
import {AccountNotices,PLAN_ENDED_CHIP} from '@/components/studio-account';
import type {StudioPage} from '@/components/studio-topbar';
import {FEATURE_LABELS,type FeatureKey} from '@/lib/accounts/plan';
import {WorkspaceFrame} from './frame';
import {SamplePicture} from './car-picture';
import {useToolSample} from './samples';

// "Needs a plan upgrade" (design/finish-pass): a tool the company's plan does
// not include, as a page in the design system. What the tool does in plain
// words, a picture of the company's own work or car (lib/tool-samples.ts),
// which plan includes it, and Ask Nmesis. When the plan has ended, it says so
// instead (F-051): the tool is off because the plan ended, not because the
// plan lacks it. No provider or model names (F-050).

type About={page:StudioPage;icon:React.ReactNode;lines:string};
const ABOUT:Partial<Record<FeatureKey,About>>={
 'studio.key_visuals':{page:'visuals',icon:<ImageIcon/>,lines:'Turn your car into a campaign picture. Choose the view in your configurator, describe the scene, and get a finished key visual to use right away.'},
 'studio.lineups':{page:'lineup',icon:<Layers/>,lines:'Put several of your cars together in one frame, lit and placed as one scene. Made for range launches and family pictures.'},
 'studio.storyboards':{page:'storyboard',icon:<Clapperboard/>,lines:'Plan a short film shot by shot. Describe your idea and the Studio writes the shots, makes a picture of each, and turns the ones you choose into a 15-second film.'},
 'studio.film':{page:'films',icon:<Film/>,lines:'Turn a key visual into a short film. You see what it costs and approve it before anything is made.'},
 'studio.swap':{page:'swap',icon:<Replace/>,lines:'Put your car into an existing ad. Add the ad’s video, choose your car in the configurator, and the Studio replaces the car in it.'},
 'studio.smart_reference':{page:'lab',icon:<Sparkles/>,lines:'Take the place, light and mood of any picture you like, and keep your own car exactly as it is.'},
};

type Props={feature:FeatureKey;/** The smallest plan that includes it (account.upsell). */plan:string;/** The company's plan has ended (planEnded). */ended:boolean};

export function UpgradePage(props:Props){
 const sample=useToolSample(props.feature);
 return <WorkspaceFrame current={ABOUT[props.feature]?.page??'home'} notices={<AccountNotices variant="ds"/>}><UpgradeView {...props} sample={sample.src}/></WorkspaceFrame>;
}

/** The page's content, without the frame (and its data), so it can be drawn on its own. */
export function UpgradeView({feature,plan,ended,sample}:Props&{sample?:string}){
 const about=ABOUT[feature],label=FEATURE_LABELS[feature];
 const [asked,setAsked]=React.useState(false);
 const answer=React.useId();
 return <div className="workspace-upgrade">
   <SamplePicture src={sample} className="ds-tool-art workspace-upgrade-art" fallback={about?.icon??<Lock/>}/>
   <div className="ds-stack workspace-upgrade-text">
    <p className="ds-label-caps">Your plan</p>
    <h1 className="ds-hero-title">{ended?'Your Studio plan has ended':`${plan} includes ${label.toLowerCase()}`}</h1>
    {about&&<p>{about.lines}</p>}
    <p className="ds-muted">{ended
     ?`New work, including ${label.toLowerCase()}, is paused. Ask Nmesis to renew your company’s plan.`
     :`Your company’s plan doesn’t include ${label.toLowerCase()} yet. Ask Nmesis to add it, or to move you to ${plan}.`}</p>
    <div className="ds-row">{ended
     ?<Badge kind="warn" icon={<Hourglass aria-hidden="true"/>}>{PLAN_ENDED_CHIP}</Badge>
     :<Badge icon={<Lock aria-hidden="true"/>}>{`Available on ${plan}`}</Badge>}</div>
    <div className="ds-row">
     <Button kind="primary" icon={<MessageCircle aria-hidden="true"/>} aria-expanded={asked} aria-controls={answer} onClick={()=>setAsked(true)}>Ask Nmesis</Button>
     <Link className="ds-btn" href="/">Back to Home</Link>
    </div>
    <div id={answer} role="status">{asked&&<p className="ds-note">{ended
     ?'Your Nmesis contact can renew your company’s Studio plan.'
     :`Your Nmesis contact can add ${label.toLowerCase()} to your company’s plan, or move you to ${plan}.`}</p>}</div>
   </div>
  </div>;
}
