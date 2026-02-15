FROM node:20-alpine

WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm ci --only=production

# 소스 복사
COPY . .
RUN npm run build

# 비루트 사용자로 실행
USER node

EXPOSE 3000

CMD ["npm", "start"]
