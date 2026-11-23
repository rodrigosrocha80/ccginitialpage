// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://ccglocacao.com.br',
  output: 'static',
  adapter: vercel(),
  integrations: [
    react(),
    sitemap(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  redirects: {
    '/index.html': { status: 301, destination: '/' },
    '/equipamentos.html': { status: 301, destination: '/equipamentos' },
    '/a-ccg.html': { status: 301, destination: '/sobre' },
    '/obras.html': { status: 301, destination: '/obras' },
    '/clientes.html': { status: 301, destination: '/clientes' },
    '/nossa-politica.html': { status: 301, destination: '/politica-integrada' },
    '/contatos.html': { status: 301, destination: '/contato' },
    '/trabalhe-conosco.html': { status: 301, destination: '/trabalhe-conosco' },
    '/admin': { status: 302, destination: '/admin/vagas' },
    '/trabalhe-conosco/admin/vagas': { status: 302, destination: '/admin/vagas' },
    // Subpáginas antigas de equipamentos -> páginas dedicadas por máquina/categoria
    '/escavadeira-hidraulica.html': { status: 301, destination: '/equipamentos/escavadeira-hidraulica-concha' },
    '/miniescavadeira.html': { status: 301, destination: '/equipamentos/mini-escavadeira-esteira' },
    '/carregadeiras.html': { status: 301, destination: '/equipamentos/carregadeiras' },
    '/minicarregadeira.html': { status: 301, destination: '/equipamentos/mini-carregadeira' },
    '/retroescavadeira.html': { status: 301, destination: '/equipamentos/retroescavadeiras' },
    '/motoniveladora.html': { status: 301, destination: '/equipamentos/motoniveladora' },
    // Subpáginas antigas de obras
    '/obra-barreirinhas.html': { status: 301, destination: '/obras#barreirinhas-sectur' },
    '/obra-sneff.html': { status: 301, destination: '/obras#areia-branca-snef' },
    '/obra-voltalia.html': { status: 301, destination: '/obras#oiapoque-voltalia' },
    '/obra-refinaria.html': { status: 301, destination: '/obras#refinaria-bacabeira' },
    '/sd11-(tfpm).html': { status: 301, destination: '/obras#cln-s11d-tfpm' },
    '/obra-vli.html': { status: 301, destination: '/obras#ferrovia-norte-sul-vli' },
    '/transposição-do-rio-são-francisco.html': { status: 301, destination: '/obras#transposicao-sao-francisco' },
    '/transposi%C3%A7%C3%A3o-do-rio-s%C3%A3o-francisco.html': { status: 301, destination: '/obras#transposicao-sao-francisco' },
  },
});
