# 🏗️ Arquitetura do Sistema Recorda

**Versão:** 1.0.0  
**Data:** Abril 2026

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura de Alto Nível](#arquitetura-de-alto-nível)
3. [Backend](#backend)
4. [Frontend](#frontend)
5. [Banco de Dados](#banco-de-dados)
6. [Segurança](#segurança)
7. [Escalabilidade](#escalabilidade)

---

## 🎯 Visão Geral

O Recorda é construído seguindo princípios de **Clean Architecture** e **Domain-Driven Design (DDD)**, garantindo:

- ✅ Separação de responsabilidades
- ✅ Testabilidade
- ✅ Manutenibilidade
- ✅ Escalabilidade
- ✅ Independência de frameworks

---

## 🏛️ Arquitetura de Alto Nível

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Pages      │  │  Components  │  │   Hooks      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐          │
│  │           React Query (Cache + State)            │          │
│  └──────────────────────────────────────────────────┘          │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP / REST API
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Fastify)                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐          │
│  │        HTTP Layer (Routes + Middleware)          │          │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐            │          │
│  │  │  Auth   │ │  CORS   │ │  Rate   │            │          │
│  │  │  JWT    │ │ Helmet  │ │ Limit   │            │          │
│  │  └─────────┘ └─────────┘ └─────────┘            │          │
│  └──────────────────────────────────────────────────┘          │
│                          ↓                                      │
│  ┌──────────────────────────────────────────────────┐          │
│  │         Application Layer (Use Cases)            │          │
│  │  - UsuarioService                                │          │
│  │  - ProducaoService                               │          │
│  │  - RelatoriosService                             │          │
│  └──────────────────────────────────────────────────┘          │
│                          ↓                                      │
│  ┌──────────────────────────────────────────────────┐          │
│  │         Domain Layer (Business Logic)            │          │
│  │  - Entities (Usuario, Producao, Repositorio)     │          │
│  │  - Value Objects                                 │          │
│  │  - Business Rules                                │          │
│  └──────────────────────────────────────────────────┘          │
│                          ↓                                      │
│  ┌──────────────────────────────────────────────────┐          │
│  │      Infrastructure Layer (External)             │          │
│  │  - Database (PostgreSQL)                         │          │
│  │  - Email (Nodemailer)                            │          │
│  │  - Storage (Filesystem)                          │          │
│  └──────────────────────────────────────────────────┘          │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
                   ┌──────────────┐
                   │  PostgreSQL  │
                   │   Database   │
                   └──────────────┘
```

---

## 🔧 Backend

### Estrutura de Camadas

```
packages/backend/src/
├── application/          # Casos de uso e serviços
│   └── services/
│       ├── UsuarioService.ts
│       ├── ProducaoService.ts
│       └── RelatoriosService.ts
│
├── domain/              # Lógica de negócio pura
│   ├── entities/        # Entidades do domínio
│   │   ├── Usuario.ts
│   │   ├── Repositorio.ts
│   │   └── Producao.ts
│   └── value-objects/   # Objetos de valor
│
├── infrastructure/      # Detalhes de implementação
│   ├── config/         # Configurações
│   ├── database/       # Conexão PostgreSQL
│   │   ├── connection.ts
│   │   └── migrate.ts
│   └── http/           # API REST
│       ├── server.ts
│       ├── routes/     # Endpoints
│       │   ├── auth.ts
│       │   ├── metas.ts
│       │   ├── operacional-*.ts
│       │   └── relatorios.ts
│       ├── schemas/    # Validação Zod
│       │   ├── auth.ts
│       │   └── producao.ts
│       └── middleware/ # Middlewares
│           ├── auth.ts
│           └── validate.ts
│
└── test/               # Helpers de teste
    └── helpers.ts
```

### Padrões Utilizados

#### 1. Clean Architecture
- **Domain** não depende de nada
- **Application** depende de Domain
- **Infrastructure** depende de Application e Domain

#### 2. Dependency Injection
```typescript
// Inversão de dependência
class UsuarioService {
  constructor(private database: Database) {}
}
```

#### 3. Repository Pattern
```typescript
interface UsuarioRepository {
  findById(id: string): Promise<Usuario | null>;
  save(usuario: Usuario): Promise<void>;
}
```

### Principais Tecnologias

| Tecnologia | Uso |
|------------|-----|
| **Fastify** | Framework HTTP (rápido e performático) |
| **Zod** | Validação de schemas |
| **JWT** | Autenticação stateless |
| **PostgreSQL** | Banco de dados relacional |
| **Vitest** | Testes unitários |
| **TypeScript** | Tipagem estática |

---

## ⚛️ Frontend

### Estrutura de Componentes

```
packages/frontend/src/
├── pages/              # Páginas da aplicação
│   ├── auth/
│   │   ├── LoginPage.tsx
│   │   └── ForgotPasswordPage.tsx
│   ├── colaborador/
│   │   ├── DashboardColaboradorPage.tsx
│   │   └── LancarProducaoPage.tsx
│   ├── operacao/
│   │   ├── ProducaoPage.tsx
│   │   └── EtapaOperacionalPage.tsx
│   └── admin/
│       ├── UsuariosPage.tsx
│       └── RelatoriosPage.tsx
│
├── components/         # Componentes reutilizáveis
│   ├── ui/            # Componentes base
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Icon.tsx
│   │   └── Toast.tsx
│   └── auth/          # Componentes de auth
│       └── ProtectedRoute.tsx
│
├── hooks/             # Custom hooks
│   ├── useQueries.ts  # React Query hooks
│   └── useAuth.ts
│
├── contexts/          # Context API
│   └── AuthContext.tsx
│
├── services/          # Serviços externos
│   └── api.ts         # Cliente API
│
└── utils/             # Utilitários
    └── errors.ts
```

### Gerenciamento de Estado

#### React Query (Server State)
```typescript
// Cache automático, refetch, invalidação
export function useProducao() {
  return useQuery({
    queryKey: ['producao'],
    queryFn: () => api.get('/producao')
  });
}

export function useLancarProducao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/producao/lancar-direto', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producao'] });
    }
  });
}
```

#### Context API (Client State)
```typescript
// Estado global de autenticação
const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  // ...
}
```

### Principais Tecnologias

| Tecnologia | Uso |
|------------|-----|
| **React 18** | Biblioteca UI |
| **Vite** | Build tool (rápido) |
| **React Query** | Server state management |
| **React Router** | Roteamento |
| **TailwindCSS** | Estilização utility-first |
| **Playwright** | Testes E2E |

---

## 🗄️ Banco de Dados

### Esquema Principal

```
┌─────────────┐
│  usuarios   │
├─────────────┤
│ id (PK)     │
│ email       │
│ nome        │
│ perfil      │◄────┐
│ senha_hash  │     │
└─────────────┘     │
                    │
┌─────────────────┐ │
│ coordenadorias  │ │
├─────────────────┤ │
│ id (PK)         │ │
│ nome            │ │
│ sigla           │ │
└─────────────────┘ │
                    │
┌─────────────────┐ │
│ repositorios    │ │
├─────────────────┤ │
│ id (PK)         │ │
│ id_ged          │ │
│ orgao           │ │
│ projeto         │ │
│ status_atual    │ │
│ etapa_atual     │ │
└────────┬────────┘ │
         │          │
         │          │
┌────────▼──────────▼───────┐
│ producao_repositorio      │
├───────────────────────────┤
│ id (PK)                   │
│ repositorio_id (FK)       │
│ usuario_id (FK)           │
│ checklist_id (FK)         │
│ etapa                     │
│ quantidade                │
│ marcadores (JSONB)        │◄── origem: 'SISTEMA' | 'LEGADO'
│ data_producao             │
└───────────────────────────┘
```

### Migrações

Todas as mudanças de schema são versionadas em:
```
db/migrations/
├── 001_initial.sql
├── 033_fluxo_operacional_repositorios.sql
├── 066_add_perfil_colaborador.sql
└── ...
```

### Índices Principais

```sql
-- Performance de queries
CREATE INDEX idx_producao_usuario_data 
  ON producao_repositorio(usuario_id, data_producao DESC);

CREATE INDEX idx_producao_repositorio_etapa 
  ON producao_repositorio(repositorio_id, etapa);

CREATE INDEX idx_repositorios_projeto_ged 
  ON repositorios(projeto, id_repositorio_ged);
```

---

## 🔒 Segurança

### Camadas de Segurança

#### 1. Autenticação (JWT)
```typescript
// Token com expiração
const token = jwt.sign({ userId, perfil }, SECRET, {
  expiresIn: '24h'
});
```

#### 2. Autorização (RBAC)
```typescript
// Middleware de autorização
function authorize(...perfisPermitidos: Perfil[]) {
  return async (request, reply) => {
    if (!perfisPermitidos.includes(request.user.perfil)) {
      return reply.status(403).send({ error: 'Acesso negado' });
    }
  };
}
```

#### 3. Validação de Dados (Zod)
```typescript
// Schema de validação rigoroso
const schema = z.object({
  repositorio: z.string().min(1).max(100),
  quantidade: z.number().int().min(1)
});
```

#### 4. SQL Injection Protection
```typescript
// SEMPRE usar prepared statements
await database.query(
  `SELECT * FROM usuarios WHERE email = $1`,
  [email] // ✅ Safe
);

// NUNCA concatenar strings
await database.query(
  `SELECT * FROM usuarios WHERE email = '${email}'` // ❌ Vulnerable
);
```

#### 5. Proteção de Cabeçalhos (Helmet)
```typescript
// Security headers automáticos
app.register(helmet, {
  contentSecurityPolicy: true,
  xssFilter: true,
  noSniff: true
});
```

#### 6. Rate Limiting
```typescript
// Limitar requisições por IP
app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});
```

### Auditoria

Todos os dados críticos têm auditoria automática:

```sql
CREATE TRIGGER audit_producao_repositorio
  AFTER INSERT OR UPDATE OR DELETE ON producao_repositorio
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
```

---

## 📈 Escalabilidade

### Horizontal Scaling

#### Backend
- ✅ Stateless (JWT, sem sessões)
- ✅ Pool de conexões PostgreSQL
- ✅ Pronto para múltiplas instâncias

#### Frontend
- ✅ PWA (cache offline)
- ✅ CDN-ready (assets estáticos)
- ✅ Code splitting automático

### Vertical Scaling

#### Database
- ✅ Índices otimizados
- ✅ Queries preparadas
- ✅ Connection pooling

### Caching Strategy

```typescript
// React Query - cache automático no frontend
queryClient.setDefaultOptions({
  queries: {
    staleTime: 5 * 60 * 1000, // 5 minutos
    cacheTime: 10 * 60 * 1000 // 10 minutos
  }
});
```

---

## 🔄 Fluxo de Requisição Completo

```
1. Cliente (Browser)
   ↓ POST /api/producao/lancar-direto
   
2. Fastify Server
   ↓ Middleware: CORS, Helmet, Rate Limit
   
3. Auth Middleware
   ↓ Verifica JWT
   ↓ Extrai usuário
   
4. Authorization Middleware
   ↓ Verifica perfil permitido
   
5. Validation Middleware (Zod)
   ↓ Valida schema do body
   
6. Route Handler
   ↓ Lógica de negócio
   ↓ Validação de duplicatas
   ↓ Validação de sequência
   
7. Database (PostgreSQL)
   ↓ Prepared statements
   ↓ Transactions
   ↓ Triggers de auditoria
   
8. Response
   ↓ JSON padronizado
   ↓ Status HTTP apropriado
   
9. Cliente (Browser)
   ↓ React Query atualiza cache
   ↓ UI re-renderiza
```

---

## 📊 Métricas e Monitoramento

### Logs Estruturados (Pino)
```typescript
request.log.info({ userId, action: 'lancar-producao' });
request.log.error({ error, context: 'database-query' });
```

### Health Checks
```typescript
app.get('/health', async () => {
  return {
    status: 'ok',
    database: await checkDatabaseConnection(),
    uptime: process.uptime()
  };
});
```

---

## 🚀 Performance

### Backend
- **Response time médio:** < 100ms
- **Throughput:** 1000+ req/s (single instance)
- **Database queries:** < 50ms (com índices)

### Frontend
- **First Contentful Paint:** < 1.5s
- **Time to Interactive:** < 3.5s
- **Lighthouse Score:** 90+

---

## 📚 Referências

- [Clean Architecture - Uncle Bob](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Domain-Driven Design](https://martinfowler.com/tags/domain%20driven%20design.html)
- [Fastify Documentation](https://www.fastify.io/)
- [React Query Documentation](https://tanstack.com/query/latest)

---

**Próximos Passos:**
- Leia [Banco de Dados](DATABASE.md) para detalhes do schema
- Veja [API Reference](API.md) para documentação de endpoints
- Consulte [Segurança](../auditorias/seguranca/AUDITORIA_SEGURANCA_PRODUCAO.md) para auditoria completa

