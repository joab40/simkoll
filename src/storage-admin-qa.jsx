import React from 'react'
import {createRoot} from 'react-dom/client'
import StorageAdmin from './storage-admin.jsx'
import './styles.css'

// Local visual fixtures, never production records or real API/storage calls.
const buckets=[
  {id:'strength-exercise-images',bytes:17300000,object_count:135,public:false},
  {id:'reward-level-art',bytes:1620000,object_count:8,public:true},
  {id:'goal-analysis-images',bytes:7850000,object_count:9,public:false},
  {id:'competition-pm',bytes:575320,object_count:1,public:false},
].map(row=>({...row,unknown_size_count:0}))
const fixture={
  current:{measuredAt:'2026-11-16T12:00:00Z',databaseBytes:41080000,fileBytes:buckets.reduce((sum,row)=>sum+row.bytes,0),fileCount:buckets.reduce((sum,row)=>sum+row.object_count,0),unknownSizeCount:0,buckets,
    kinds:[{kind:'image',bytes:26770000,object_count:152},{kind:'document',bytes:575320,object_count:1}],areas:[],tables:[],schemas:[]},
  settings:{database_budget_bytes:null,file_budget_bytes:null,updated_at:'2026-11-16T12:00:00Z'},history:[],events:[],dailyScheduleEnabled:true,
}
const request=async(_url,_code,options={})=>{
  if(options.method)throw Error('Skrivskyddad lokal demo – inga ändringar sparas.')
  return structuredClone(fixture)
}
function Demo(){return <main style={{maxWidth:1100,margin:'24px auto',padding:20}}><h1>Lagringsöversikt · fiktiv demo</h1><p>Testvärden. Inga API-anrop, inga verkliga filer och inga databasändringar.</p><StorageAdmin code="demo" request={request}/></main>}
if(new URLSearchParams(location.search).get('viewport')==='mobile')createRoot(document.getElementById('root')).render(<iframe title="Lagring i mobilbredd" src="/storage-admin-qa.html" style={{width:390,height:'100vh',border:0,display:'block'}}/>);else createRoot(document.getElementById('root')).render(<Demo/> )
