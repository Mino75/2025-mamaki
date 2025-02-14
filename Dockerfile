# Use a fixed version of Node.js (LTS version recommended)
FROM node:18.18.0-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available) for dependencies
COPY package*.json ./

# Install dependencies in production mode
RUN npm install --omit=dev

# Copy the rest of the application files
COPY . .

# Expose the port that the app runs on
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production

# Start the application
CMD ["node", "server.js"]
