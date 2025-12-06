import 'dotenv/config'
import loggedServer from './utils/logged-server.js'
import setupSwagger from './utils/swagger.docs.js'
import helloRoute, { swaggerConfig as helloSpec } from './routes/hello.route.js'
import authRoute, { swaggerConfig as authSpec } from './routes/auth.route.js'
import doctorRoute, { swaggerConfig as doctorSpec } from './routes/doctor.routes.js'
import adminRoute, { swaggerConfig as adminSpec } from './routes/admin.routes.js'
import patientRoute, { swaggerConfig as patientSpec } from './routes/patient.routes.js'
import staffRoute, { swaggerConfig as staffSpec } from './routes/staff.routes.js'
import mongoose from 'mongoose'
import { errorHandler, notFound } from './middlewares/error.js'
import redisCache from './utils/redis.js'

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/medical_app')
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Connect to Redis
await redisCache.connect();

// Create logged server
const server = loggedServer(PORT, () => {
    console.log('Callback: Server has started successfully.');
}, 'app');

const app = server.app;

// Setup Swagger documentation
await setupSwagger(app, [helloSpec, authSpec, doctorSpec, adminSpec, patientSpec, staffSpec]);

// Use routes
app.use('/', helloRoute);
app.use('/auth', authRoute);
app.use('/doctor', doctorRoute);
app.use('/admin', adminRoute);
app.use('/patient', patientRoute);
app.use('/staff', staffRoute);

// Error handling
app.use(notFound);
app.use(errorHandler);

server.start(() => {
    console.log('Server startup complete.');
});