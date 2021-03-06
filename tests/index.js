const _         = require('lodash');
const sinon     = require('sinon');
const chai      = require('chai');
const sinonChai = require("sinon-chai");
const Validator = require('ajv');

const ajv2swagger = require('../index.js');

const expect = chai.expect;

chai.use(sinonChai);
chai.should();

describe('toSwagger', function() {
    beforeEach(function() {
        this.validator = new Validator({});
    });

    afterEach(function() {
        delete this.validator;
    });

    it('should dereference all `$ref` schema references', function() {
        this.validator.addSchema({type: 'integer'}, 'id');
        this.validator.addSchema({type: 'string'}, 'name');
        this.validator.addSchema({type: 'string'}, 'code_2');
        this.validator.addSchema({
            type: 'object',
            properties: {
                id: {$ref: 'id'}
            }
        }, 'app');

        var schema = {
            type: 'object',
            properties: {
                code_3: {type: 'string'},
                name: {$ref: 'name', default: 'john'},
                country: {
                    type: 'object',
                    properties: {
                        code_2: {$ref: 'code_2'},
                        code_3: {$ref: '#/properties/code_3'}
                    }
                },
                apps: {
                    type: 'array',
                    items: {$ref: 'app'}
                }
            }
        };

        this.validator.addSchema(schema, 'schema');
        var toSwagger = ajv2swagger.toSwagger('schema', this.validator);

        var result = toSwagger({in: 'body'});
        result.should.be.an.instanceof(Array).that.is.not.empty;
        result.pop().schema.should.be.eql({
            type: 'object',
            properties: {
                code_3: {type: 'string'},
                name: {type: 'string', default: 'john'},
                country: {
                    type: 'object',
                    properties: {
                        code_2: {type: 'string'},
                        code_3: {type: 'string'}
                    }
                },
                apps: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: {type: 'integer'}
                        }
                    }
                }
            }
        });
    });

    it('should derefence schema $refs before schema sanitization', function() {
        this.validator.addSchema({
            type: 'object',
            properties: {
                code_2: {
                    type: ['string', 'null'],
                    $desc: 'description'
                }
            }
        }, 'country');

        var schema = {
            type: 'object',
            properties: {
                name: {type: 'string'},
                country: {$ref: 'country'}
            }
        };

        this.validator.addSchema(schema, 'schema');
        var toSwagger = ajv2swagger.toSwagger('schema', this.validator);

        var result = toSwagger({in: 'body'});
        result.should.be.an.instanceof(Array).that.is.not.empty;
        result.pop().schema.should.be.eql({
            type: 'object',
            properties: {
                name: {type: 'string'},
                country: {
                    type: 'object',
                    properties: {
                        code_2: {
                            type: 'string',
                            description: 'description'
                        },
                    }
                }
            }
        });
    });

    it('should transform `type:["null", ...]` into `nullable: true` property (OAS v3)', function() {
        var schema = {
            type: 'object',
            properties: {
                username: { type: ['string', 'null'] },
                country: {
                    type: 'object',
                    properties: {
                        code_2: { type: ['string', 'null'] }
                    }
                },
                collection: {
                    type: 'array',
                    items: { type: ['integer', 'null'] }
                }
            }
        };

        this.validator.addSchema(schema, 'schema');
        var toSwagger = ajv2swagger.toSwagger('schema', this.validator, 3);

        var result = toSwagger({in: 'body'});
        result.should.be.an.instanceof(Array).that.is.not.empty;
        result.pop().schema.should.be.eql({
            type: 'object',
            properties: {
                username: {
                    type: 'string',
                    nullable: true,
                },
                country: {
                    type: 'object',
                    properties: {
                        code_2: {
                            type: 'string',
                            nullable: true
                        }
                    }
                },
                collection: {
                    type: 'array',
                    items: {
                        type: 'integer',
                        nullable: true
                    }
                }
            }
        });
    });

    it('should get rid off the `allOf` keyword if its used for $toJSON data coercion only', function() {
        var schema = {
            type: 'object',
            required: ['prop'],
            properties: {
                prop: {
                    allOf: [
                        {$toJSON: {}},
                        {
                            type: 'object',
                            required: ['json'],
                            properties: {
                                json: { type: 'boolean' }
                            }
                        }
                    ]
                }
            }
        };

        this.validator.addSchema(schema, 'schema', 2);
        var toSwagger = ajv2swagger.toSwagger('schema', this.validator);

        var result = toSwagger({in: 'body'});
        result.should.be.an.instanceof(Array).that.is.not.empty;
        result.pop().schema.should.be.eql({
            type: 'object',
            required: ['prop'],
            properties: {
                prop: {
                    type: 'object',
                    required: ['json'],
                    properties: {
                        json: { type: 'boolean' }
                    }
                }
            }
        });
    });

    it('should get rid off the `allOf` when it has single element only', function() {
        var schema = {
            type: 'object',
            required: ['prop'],
            properties: {
                prop: {
                    default: {prop: 'value'},
                    allOf: [
                        {
                            type: 'object',
                            required: ['json'],
                            properties: {
                                json: { type: 'boolean' }
                            }
                        }
                    ]
                }
            }
        };

        this.validator.addSchema(schema, 'schema', 2);
        var toSwagger = ajv2swagger.toSwagger('schema', this.validator);

        var result = toSwagger({in: 'body'});
        result.should.be.an.instanceof(Array).that.is.not.empty;
        result.pop().schema.should.be.eql({
            type: 'object',
            required: ['prop'],
            properties: {
                prop: {
                    type: 'object',
                    required: ['json'],
                    default: {prop: 'value'},
                    properties: {
                        json: { type: 'boolean' }
                    }
                }
            }
        });
    });

    it('should NOT alter state of original schema object', function() {
        const schema = {
            type: 'object',
            required: ['prop'],
            properties: {
                prop: {
                    allOf: [
                        {$toJSON: {}},
                        {type: 'object'}
                    ]
                },
                prop2: {
                    type: 'integer',
                    $desc: 'description'
                }
            }
        };

        const schemaBackup = _.cloneDeep(schema);

        this.validator.addSchema(schema, 'schema');
        var toSwagger = ajv2swagger.toSwagger('schema', this.validator);
        schema.should.be.eql(schemaBackup);
    });

    it('should NOT alter state of original schema object that has been used for resolving $ref', function() {
        const prop = {//the schema structure matter in this test case!
            type: "object",
            properties: {
                nested: {
                    allOf: [
                        {$toJSON: {}},
                        {type: 'object'}
                    ]
                }
            }
        };

        const schema = {
            type: 'object',
            required: ['prop'],
            properties: {
                prop: {$ref: 'prop'},
                prop2: {
                    type: 'integer',
                    $desc: 'description'
                }
            }
        };

        const propBackup = _.cloneDeep(prop);

        this.validator.addSchema(prop, 'prop');
        this.validator.addSchema(schema, 'schema');

        var toSwagger = ajv2swagger.toSwagger('schema', this.validator);
        prop.should.be.eql(propBackup);
    });

    it('should NOT fail when a schema does not have the `properties` property', function() {
        var schema = {
            type: 'object',
        };

        this.validator.addSchema(schema, 'schema', 2);
        var toSwagger = ajv2swagger.toSwagger('schema', this.validator);

        expect(function() {
            toSwagger({in: 'formData'});
        }).to.not.throw(Error);
    });

    it('should merge schemas of `oneOf` keyword into the parent schema (OAS v2) ', function() {
        var schema = {
            type: 'object',
            properties: {
                username: { type: 'string' },
            },
            oneOf: [
                {
                    properties: {
                        email: {type: 'string'}
                    }
                },
                {
                    properties: {
                        tel: {type: 'string'}
                    }
                }
            ]
        };

        this.validator.addSchema(schema, 'schema', 2);
        var toSwagger = ajv2swagger.toSwagger('schema', this.validator);

        var result = toSwagger({in: 'body'});
        result.should.be.an.instanceof(Array).that.is.not.empty;
        result.pop().schema.should.be.eql({
            type: 'object',
            properties: {
                username: {type: 'string'},
                email: {type: 'string'},
                tel: {type: 'string'},
            }
        });
    });

    it('should merge schemas of `anyOf` keyword into the parent schema (OAS v2) ', function() {
        var schema = {
            type: 'object',
            properties: {
                username: { type: 'string' },
            },
            anyOf: [
                {
                    properties: {
                        email: {type: 'string'}
                    }
                },
                {
                    properties: {
                        tel: {type: 'string'}
                    }
                }
            ]
        };

        this.validator.addSchema(schema, 'schema', 2);
        var toSwagger = ajv2swagger.toSwagger('schema', this.validator);

        var result = toSwagger({in: 'body'});
        result.should.be.an.instanceof(Array).that.is.not.empty;
        result.pop().schema.should.be.eql({
            type: 'object',
            properties: {
                username: {type: 'string'},
                email: {type: 'string'},
                tel: {type: 'string'},
            }
        });
    });

    it('should change the type property of multi-type property to "string" type', function() {
        var schema = {
            type: 'object',
            properties: {
                username: { type: ['string', 'integer'] },
            }
        };

        this.validator.addSchema(schema, 'schema');
        var toSwagger = ajv2swagger.toSwagger('schema', this.validator);

        var result = toSwagger({in: 'body'});
        result.should.be.an.instanceof(Array).that.is.not.empty;
        result.pop().schema.should.be.eql({
            type: 'object',
            properties: {
                username: {
                    type: 'string'
                }
            }
        });
    });

    it('should move each `$desc` property to `description` property', function() {
        var schema = {
            type: 'object',
            properties: {
                username: {
                    type: 'string',
                    $desc: 'public user identifier'
                },
                country: {
                    type: 'object',
                    $desc: 'user location',
                    properties: {
                        code_2: {
                            type: 'string',
                            $desc: 'two letter country code'
                        }
                    }
                },
                collection: {
                    type: 'array',
                    $desc: 'array description',
                    items: {
                        type: 'integer',
                        $desc: 'array item description'
                    }
                }
            }
        };

        this.validator.addSchema(schema, 'schema');
        var toSwagger = ajv2swagger.toSwagger('schema', this.validator);

        var result = toSwagger({in: 'body'});
        result.should.be.an.instanceof(Array).that.is.not.empty;
        result.pop().schema.should.be.eql({
            type: 'object',
            properties: {
                username: {
                    type: 'string',
                    description: 'public user identifier'
                },
                country: {
                    type: 'object',
                    description: 'user location',
                    properties: {
                        code_2: {
                            type: 'string',
                            description: 'two letter country code'
                        }
                    }
                },
                collection: {
                    type: 'array',
                    description: 'array description',
                    items: {
                        type: 'integer',
                        description: 'array item description'
                    }
                }
            }
        });
    });

    describe('JSON body payload', function() {
        beforeEach(function() {
            this.schema = {
                type: 'object',
                properties: {
                    username: {type: 'string'},
                    country: {
                        type: 'object',
                        properties: {
                            code_2: {type: 'string'},
                            code_3: {type: 'string'},
                        }
                    }
                }
            };

            this.validator.addSchema(this.schema, 'schema');
            this.toSwagger = ajv2swagger.toSwagger('schema', this.validator);
        });

        it('should return an array with single json body payload descriptor', function() {

            this.toSwagger({in: 'body'}).should.be.eql([{
                in: 'body',
                name: 'JSON payload',
                description: '',
                required: false,
                schema: this.schema
            }]);
        });

        it('should fallback to json body payload when request formData parameters contain complex data structures', function() {
            this.toSwagger({in: 'formData'}).should.be.eql([{
                in: 'body',
                name: 'JSON payload',
                description: '',
                required: false,
                schema: this.schema
            }]);
        });
    });

    ['formData', 'query', 'path'].forEach(function($in) {
        describe(`${$in} parameters`, function() {

            it(`should return an array with each ${$in} property descriptor being an item of array`, function() {
                var schema = {
                    type: 'object',
                    required: ['email', 'name'],
                    properties: {
                        name: {type: 'string'},
                        email: {type: 'string', format: 'email'},
                        age: {type: 'integer'},
                    }
                };

                this.validator.addSchema(schema, 'schema');
                var toSwagger = ajv2swagger.toSwagger('schema', this.validator);

                toSwagger({in: $in}).should.be.eql([
                    {
                        name: 'name',
                        in: $in,
                        type: 'string',
                        required: true
                    },
                    {
                        name: 'email',
                        in: $in,
                        format: 'email',
                        type: 'string',
                        required: true
                    },
                    {
                        name: 'age',
                        in: $in,
                        type: 'integer',
                        required: false
                    },
                ]);
            });

            it('should generate correct schema for OAS v3', function() {
                var schema = {
                    type: 'object',
                    required: ['email', 'name'],
                    properties: {
                        name: {type: 'string'},
                        email: {type: 'string', format: 'email'},
                        age: {type: 'integer'},
                    }
                };

                this.validator.addSchema(schema, 'schema');
                var toSwagger = ajv2swagger.toSwagger('schema', this.validator, 3);

                toSwagger({in: $in}).should.be.eql([
                    {
                        name: 'name',
                        in: $in,
                        schema: {type: 'string'},
                        required: true
                    },
                    {
                        name: 'email',
                        in: $in,
                        schema: {type: 'string', format: 'email'},
                        required: true
                    },
                    {
                        name: 'age',
                        in: $in,
                        schema: {type: 'integer'},
                        required: false
                    },
                ]);
            });

            if (~['query', 'path'].indexOf($in)) {
                it(`should throw a Error when there is an attempt to convert complex data structure to ${$in}`, function() {
                    var schema = {
                        type: 'object',
                        properties: {
                            country: {
                                type: 'object',
                                properties: {
                                    code_2: {type: 'string'}
                                }
                            }
                        }
                    };

                    this.validator.addSchema(schema, 'schema');
                    var toSwagger = ajv2swagger.toSwagger('schema', this.validator);

                    expect(toSwagger.bind(null, {in: $in})).to.throw(Error);
                });
            }
        });
    });
});
