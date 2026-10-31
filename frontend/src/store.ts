import { configureStore, createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export type Repository = { _id:string; fullName:string; htmlUrl:string; description:string; primaryLanguage:string; defaultBranch:string }
export type Issue = { number:number; title:string; body:string; labels:string[]; createdAt:string }
export type Run = { _id:string; status:string; classification:string; summary:string; rootCause:string; relevantFiles:string[]; generatedPatch:string; patchSha256:string; testResults:{status:string;command?:string;output?:string}; approvalState:string }

type State = { repository:Repository|null; issues:Issue[]; selectedIssue:Issue|null; run:Run|null; loading:boolean }
const initial:State={repository:null,issues:[],selectedIssue:null,run:null,loading:false}
const appSlice=createSlice({name:'app',initialState:initial,reducers:{setLoading:(s,a:PayloadAction<boolean>)=>{s.loading=a.payload},setRepository:(s,a:PayloadAction<Repository>)=>{s.repository=a.payload},setIssues:(s,a:PayloadAction<Issue[]>)=>{s.issues=a.payload},selectIssue:(s,a:PayloadAction<Issue>)=>{s.selectedIssue=a.payload},setRun:(s,a:PayloadAction<Run>)=>{s.run=a.payload}}})
export const actions=appSlice.actions
export const store=configureStore({reducer:{app:appSlice.reducer}})
export type RootState=ReturnType<typeof store.getState>
export type AppDispatch=typeof store.dispatch
