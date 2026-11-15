'use client';
import {ConfirmProvider} from '@/components/ds/dialog';
import {ToastProvider} from '@/components/ds/toast';
// The design system's dialog that asks (in place of confirm()) and its toasts
// with Undo, for every screen. Dark, like the screens, until Phase 3 moves the
// screens themselves onto the tokens.
export function StudioProviders({children}:{children:React.ReactNode}){
 return <ConfirmProvider theme="dark"><ToastProvider theme="dark">{children}</ToastProvider></ConfirmProvider>;
}
