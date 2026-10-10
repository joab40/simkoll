export const pepKey = (item) => `${item.type}-${item.id}`
export const pepDay = (value) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm'}).format(new Date(value))
export const pepTime = (value) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',hour:'2-digit',minute:'2-digit'}).format(new Date(value))
export function pepTimeline(items) {
  return [...items].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)||pepKey(a).localeCompare(pepKey(b))).map((item,index,list)=>{
    const previous=list[index-1],day=pepDay(item.createdAt)
    return {...item,day,newDay:!previous||pepDay(previous.createdAt)!==day,grouped:Boolean(previous&&pepDay(previous.createdAt)===day&&(previous.sender?.id||previous.type)===(item.sender?.id||item.type)&&new Date(item.createdAt)-new Date(previous.createdAt)<300000)}
  })
}
