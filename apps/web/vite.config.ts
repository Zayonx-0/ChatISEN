import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{port:Number(process.env.CHATISEN_WEB_PORT||5173),host:'127.0.0.1',strictPort:true,proxy:{'/api':{target:process.env.CHATISEN_API_TARGET||'http://127.0.0.1:3000',ws:true}}}});
