function forbidNonAdmin(user){
  if(user?.role!=='admin')return {status:403,body:{error:'无权限'}};
  return null;
}

const LOGIN_STORAGE_TIMEOUT_ERROR='登录服务暂时超时，请重试';
const DEFAULT_LOGIN_ROW_TIMEOUT_MS=1500;
const DEFAULT_LOGIN_SCAN_TIMEOUT_MS=1500;

function isTransientLoginStorageError(err){
  return /Client network socket disconnected before secure TLS connection was established|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|timeout/i.test(String(err?.message||err||''));
}

function withDeadline(promise, ms, fallbackValue){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>resolve(fallbackValue),ms);
    Promise.resolve(promise).then(
      (value)=>{
        clearTimeout(timer);
        resolve(value);
      },
      (err)=>{
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function createAuthAdminHandler(deps){
  const {
    init,
    get,
    put,
    getCachedRow,
    getCachedScan,
    bcrypt,
    jwt,
    jwtSecret,
    fetchWechatSession,
    extractWechatOpenId,
    findWechatUserByOpenId,
    mergeStoredAuthUser,
    assertAuthUserActive,
    userMatchPermissions,
    buildWechatBoundUser,
    buildWechatUnboundUser,
    buildAdminUserView,
    assertPhone,
    isTableMissingError,
    tables,
    logger,
    loginRowTimeoutMs=DEFAULT_LOGIN_ROW_TIMEOUT_MS,
    loginScanTimeoutMs=DEFAULT_LOGIN_SCAN_TIMEOUT_MS
  } = deps;

  async function loadLoginAccount(username){
    const lookupTimeout=Symbol('login-row-timeout');
    const scanTimeout=Symbol('login-scan-timeout');
    try{
      const account=await withDeadline(getCachedRow(tables.users,username),loginRowTimeoutMs,lookupTimeout);
      if(account!==lookupTimeout)return account;
      logger?.warn?.(`[auth/login] ft_users row lookup timed out for ${username}, falling back to user scan cache`);
    }catch(err){
      if(!isTableMissingError(err)&&!isTransientLoginStorageError(err))throw err;
      if(isTableMissingError(err))return null;
      logger?.warn?.(`[auth/login] ft_users row lookup failed for ${username}: ${err.message||err}`);
    }
    try{
      const rows=await withDeadline(
        getCachedScan(tables.users).catch((err)=>{
          if(isTableMissingError(err))return [];
          throw err;
        }),
        loginScanTimeoutMs,
        scanTimeout
      );
      if(rows===scanTimeout)return {__loginTimeout:true};
      return (Array.isArray(rows)?rows:[]).find((item)=>String(item?.id||'')===String(username))||null;
    }catch(err){
      if(isTableMissingError(err))return null;
      if(isTransientLoginStorageError(err))return {__loginTimeout:true};
      throw err;
    }
  }

  return async function handleAuthAdminRequest({path,method,user,body,req}){
    if(path==='/auth/login'&&method==='POST'){
      const { username, password } = body || {};
      if(!username||!password)return {status:400,body:{error:'请填写账号和密码'}};
      const account=await loadLoginAccount(username);
      if(account?.__loginTimeout)return {status:503,body:{error:LOGIN_STORAGE_TIMEOUT_ERROR}};
      if(!account||!await bcrypt.compare(password,account.password))return {status:401,body:{error:'账号或密码错误'}};
      const payload=mergeStoredAuthUser(null,account);
      try{assertAuthUserActive(payload);}catch(err){return {status:403,body:{error:err.message}};}
      const token=jwt.sign(payload,jwtSecret,{expiresIn:'7d'});
      return {body:{token,user:payload}};
    }

    if(path==='/auth/wechat-login'&&method==='POST'){
      const code=String(body?.code||'').trim();
      if(!code)return {status:400,body:{error:'缺少微信登录凭证'}};
      const session=await fetchWechatSession(code,'coach');
      const openid=extractWechatOpenId(session);
      const account=findWechatUserByOpenId(await getCachedScan(tables.users).catch(()=>[]),openid);
      if(!account)return {status:404,body:{error:'微信未绑定教练账号，请先使用账号密码登录完成绑定'}};
      const payload=mergeStoredAuthUser(null,account);
      try{assertAuthUserActive(payload);}catch(err){return {status:403,body:{error:err.message}};}
      const token=jwt.sign(payload,jwtSecret,{expiresIn:'7d'});
      return {body:{token,user:payload}};
    }

    if(path==='/auth/wechat-bind'&&method==='POST'){
      const code=String(body?.code||'').trim();
      if(!code)return {status:400,body:{error:'缺少微信登录凭证'}};
      const session=await fetchWechatSession(code,'coach');
      const openid=extractWechatOpenId(session);
      const stored=await get(tables.users,user?.id);
      if(!stored)return {status:404,body:{error:'用户不存在'}};
      await put(tables.users,user.id,buildWechatBoundUser(stored,openid));
      return {body:{success:true,wechatBound:true}};
    }

    if(path==='/auth/me')return {body:user};

    if(path==='/auth/change-password'&&method==='POST'){
      const stored=await get(tables.users,user?.id);
      if(!stored)return {status:404,body:{error:'用户不存在'}};
      if(!await bcrypt.compare(body?.oldPassword,stored.password))return {status:400,body:{error:'原密码错误'}};
      await put(tables.users,user.id,{...stored,password:await bcrypt.hash(body?.newPassword,10)});
      return {body:{success:true}};
    }

    if(path==='/admin/create-user'&&method==='POST'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const { id, name, password, role, coachId, coachName } = body || {};
      if(!id||!name||!password)return {status:400,body:{error:'缺少必填字段'}};
      const nextRole=role||'editor';
      const hashed=await bcrypt.hash(password,10);
      const nextCoachName=coachName||(nextRole==='editor'?name:'');
      const matchPermissions=userMatchPermissions({matchPermissions:body.matchPermissions||body.permissions||[]});
      const phone=assertPhone(body?.phone||'');
      await put(tables.users,id,{
        id,
        name,
        phone,
        password:hashed,
        role:nextRole,
        status:'active',
        coachId:coachId||'',
        coachName:nextCoachName,
        matchPermissions
      });
      return {body:{success:true,id,name,role:nextRole,status:'active',coachId:coachId||'',coachName:nextCoachName,matchPermissions}};
    }

    if(path==='/admin/update-user'&&method==='POST'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const { id, coachId, coachName, status } = body || {};
      if(!id)return {status:400,body:{error:'缺少用户ID'}};
      const stored=await get(tables.users,id);
      if(!stored)return {status:404,body:{error:'用户不存在'}};
      let updates={...stored,coachId:coachId||'',status:status||stored.status||'active'};
      if(body.name)updates.name=body.name;
      if(Object.prototype.hasOwnProperty.call(body||{},'phone'))updates.phone=assertPhone(body.phone||'');
      updates.coachName=coachName||(stored.role==='editor'?(updates.name||stored.name):'');
      if(Array.isArray(body.matchPermissions)||Array.isArray(body.permissions))updates.matchPermissions=userMatchPermissions({matchPermissions:body.matchPermissions||body.permissions});
      if(body.clearWechat)updates=buildWechatUnboundUser(updates);
      await put(tables.users,id,updates);
      return {body:{success:true}};
    }

    if(path==='/admin/users'&&method==='GET'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const all=await getCachedScan(tables.users);
      return {body:all.map(buildAdminUserView)};
    }

    return null;
  };
}

module.exports = { createAuthAdminHandler };
