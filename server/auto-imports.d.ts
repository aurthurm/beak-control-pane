export {}

declare global {
  const createError: typeof import('h3').createError
  const deleteCookie: typeof import('h3').deleteCookie
  const defineEventHandler: typeof import('h3').defineEventHandler
  const getCookie: typeof import('h3').getCookie
  const getHeader: typeof import('h3').getHeader
  const getQuery: typeof import('h3').getQuery
  const getRouterParam: typeof import('h3').getRouterParam
  const getRequestHeader: typeof import('h3').getRequestHeader
  const getRequestURL: typeof import('h3').getRequestURL
  const readBody: typeof import('h3').readBody
  const setCookie: typeof import('h3').setCookie
  const setHeader: typeof import('h3').setHeader
  const useRuntimeConfig: typeof import('#app').useRuntimeConfig
}
