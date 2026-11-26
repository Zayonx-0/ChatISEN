/**
 * Un module situé plus haut dans le graphe réagit à la fin d'une session sans que
 * le module identity le connaisse.
 */
export class SessionHooks{
  private hooks:((sessionId:string)=>Promise<unknown>)[]=[];
  constructor(private onError:(error:unknown)=>void){}
  onRevoked(hook:(sessionId:string)=>Promise<unknown>){this.hooks.push(hook);}
  async revoked(sessionId:string){for(const hook of this.hooks)await hook(sessionId).catch(this.onError);}
}
