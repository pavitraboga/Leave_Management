const { createApp } = require('./app');
const { createMongoStore } = require('./stores/mongoStore');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/leave_db';

async function seed(store) {
  if ((await store.listEmployees()).length > 0) return;
  await store.createEmployee({ name: 'Asha (Employee)', email: 'asha@corp.test', role: 'employee', leaveBalance: 20 });
  await store.createEmployee({ name: 'Ravi (Employee)', email: 'ravi@corp.test', role: 'employee', leaveBalance: 0 });
  await store.createEmployee({ name: 'Meera (Manager)', email: 'meera@corp.test', role: 'manager', leaveBalance: 20 });
  await store.createEmployee({ name: 'Kiran (HR)', email: 'kiran@corp.test', role: 'hr', leaveBalance: 20 });
  console.log('Seeded demo employees');
}

async function start() {
  for (let attempt = 1; ; attempt++) {
    try {
      const store = await createMongoStore(MONGO_URI);
      await seed(store);
      createApp(store).listen(PORT, () => console.log(`Leave app listening on :${PORT}`));
      return;
    } catch (err) {
      if (attempt >= 10) throw err;
      console.log(`MongoDB not ready (attempt ${attempt}), retrying in 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
