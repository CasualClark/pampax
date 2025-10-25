/**
 * Simple CRUD operations stub for CLI tests
 */

export class StorageOperations {
  constructor(db) {
    this.db = db;
  }

  async create(table, data) {
    // Mock create implementation
    return { id: Date.now(), ...data };
  }

  async read(table, id) {
    // Mock read implementation
    return { id, table, data: 'mock data' };
  }

  async update(table, id, data) {
    // Mock update implementation
    return { id, ...data, updated: true };
  }

  async delete(table, id) {
    // Mock delete implementation
    return { deleted: true, id };
  }

  async list(table, filters = {}) {
    // Mock list implementation
    return [
      { id: 1, table, ...filters },
      { id: 2, table, ...filters }
    ];
  }

  async query(sql, params = []) {
    // Mock query implementation
    return { rows: [], rowCount: 0 };
  }
}

export default StorageOperations;