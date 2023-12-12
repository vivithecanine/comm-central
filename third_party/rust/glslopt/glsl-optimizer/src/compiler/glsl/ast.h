/* -*- c++ -*- */
/*
 * Copyright © 2009 Intel Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice (including the next
 * paragraph) shall be included in all copies or substantial portions of the
 * Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

#ifndef AST_H
#define AST_H

#include "list.h"
#include "glsl_parser_extras.h"
#include "compiler/glsl_types.h"
#include "util/bitset.h"

struct _mesa_glsl_parse_state;

struct YYLTYPE;

/**
 * \defgroup AST Abstract syntax tree node definitions
 *
 * An abstract syntax tree is generated by the parser.  This is a fairly
 * direct representation of the gramma derivation for the source program.
 * No symantic checking is done during the generation of the AST.  Only
 * syntactic checking is done.  Symantic checking is performed by a later
 * stage that converts the AST to a more generic intermediate representation.
 *
 *@{
 */
/**
 * Base class of all abstract syntax tree nodes
 */
class ast_node {
public:
   DECLARE_LINEAR_ZALLOC_CXX_OPERATORS(ast_node);

   /**
    * Print an AST node in something approximating the original GLSL code
    */
   virtual void print(void) const;

   /**
    * Convert the AST node to the high-level intermediate representation
    */
   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   virtual bool has_sequence_subexpression() const;

   /**
    * Retrieve the source location of an AST node
    *
    * This function is primarily used to get the source position of an AST node
    * into a form that can be passed to \c _mesa_glsl_error.
    *
    * \sa _mesa_glsl_error, ast_node::set_location
    */
   struct YYLTYPE get_location(void) const
   {
      struct YYLTYPE locp;

      locp.path = this->location.path;
      locp.source = this->location.source;
      locp.first_line = this->location.first_line;
      locp.first_column = this->location.first_column;
      locp.last_line = this->location.last_line;
      locp.last_column = this->location.last_column;

      return locp;
   }

   /**
    * Set the source location of an AST node from a parser location
    *
    * \sa ast_node::get_location
    */
   void set_location(const struct YYLTYPE &locp)
   {
      this->location.path = locp.path;
      this->location.source = locp.source;
      this->location.first_line = locp.first_line;
      this->location.first_column = locp.first_column;
      this->location.last_line = locp.last_line;
      this->location.last_column = locp.last_column;
   }

   /**
    * Set the source location range of an AST node using two location nodes
    *
    * \sa ast_node::set_location
    */
   void set_location_range(const struct YYLTYPE &begin, const struct YYLTYPE &end)
   {
      this->location.path = begin.path;
      this->location.source = begin.source;
      this->location.first_line = begin.first_line;
      this->location.last_line = end.last_line;
      this->location.first_column = begin.first_column;
      this->location.last_column = end.last_column;
   }

   /**
    * Source location of the AST node.
    */
   struct {
      char *path;               /**< GLSL shader include path. */
      unsigned source;          /**< GLSL source number. */
      unsigned first_line;      /**< First line number within the source string. */
      unsigned first_column;    /**< First column in the first line. */
      unsigned last_line;       /**< Last line number within the source string. */
      unsigned last_column;     /**< Last column in the last line. */
   } location;

   exec_node link;

   virtual void set_is_lhs(bool);

protected:
   /**
    * The only constructor is protected so that only derived class objects can
    * be created.
    */
   ast_node(void);
};


/**
 * Operators for AST expression nodes.
 */
enum ast_operators {
   ast_assign,
   ast_plus,        /**< Unary + operator. */
   ast_neg,
   ast_add,
   ast_sub,
   ast_mul,
   ast_div,
   ast_mod,
   ast_lshift,
   ast_rshift,
   ast_less,
   ast_greater,
   ast_lequal,
   ast_gequal,
   ast_equal,
   ast_nequal,
   ast_bit_and,
   ast_bit_xor,
   ast_bit_or,
   ast_bit_not,
   ast_logic_and,
   ast_logic_xor,
   ast_logic_or,
   ast_logic_not,

   ast_mul_assign,
   ast_div_assign,
   ast_mod_assign,
   ast_add_assign,
   ast_sub_assign,
   ast_ls_assign,
   ast_rs_assign,
   ast_and_assign,
   ast_xor_assign,
   ast_or_assign,

   ast_conditional,

   ast_pre_inc,
   ast_pre_dec,
   ast_post_inc,
   ast_post_dec,
   ast_field_selection,
   ast_array_index,
   ast_unsized_array_dim,

   ast_function_call,

   ast_identifier,
   ast_int_constant,
   ast_uint_constant,
   ast_float_constant,
   ast_bool_constant,
   ast_double_constant,
   ast_int64_constant,
   ast_uint64_constant,

   ast_sequence,
   ast_aggregate

   /**
    * Number of possible operators for an ast_expression
    *
    * This is done as a define instead of as an additional value in the enum so
    * that the compiler won't generate spurious messages like "warning:
    * enumeration value ‘ast_num_operators’ not handled in switch"
    */
   #define AST_NUM_OPERATORS (ast_aggregate + 1)
};

/**
 * Representation of any sort of expression.
 */
class ast_expression : public ast_node {
public:
   ast_expression(int oper, ast_expression *,
		  ast_expression *, ast_expression *);

   ast_expression(const char *identifier) :
      oper(ast_identifier)
   {
      subexpressions[0] = NULL;
      subexpressions[1] = NULL;
      subexpressions[2] = NULL;
      primary_expression.identifier = identifier;
      this->non_lvalue_description = NULL;
      this->is_lhs = false;
   }

   static const char *operator_string(enum ast_operators op);

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   virtual void hir_no_rvalue(exec_list *instructions,
                              struct _mesa_glsl_parse_state *state);

   virtual bool has_sequence_subexpression() const;

   ir_rvalue *do_hir(exec_list *instructions,
                     struct _mesa_glsl_parse_state *state,
                     bool needs_rvalue);

   virtual void print(void) const;

   enum ast_operators oper;

   ast_expression *subexpressions[3];

   union {
      const char *identifier;
      int int_constant;
      float float_constant;
      unsigned uint_constant;
      int bool_constant;
      double double_constant;
      uint64_t uint64_constant;
      int64_t int64_constant;
   } primary_expression;


   /**
    * List of expressions for an \c ast_sequence or parameters for an
    * \c ast_function_call
    */
   exec_list expressions;

   /**
    * For things that can't be l-values, this describes what it is.
    *
    * This text is used by the code that generates IR for assignments to
    * detect and emit useful messages for assignments to some things that
    * can't be l-values.  For example, pre- or post-incerement expressions.
    *
    * \note
    * This pointer may be \c NULL.
    */
   const char *non_lvalue_description;

   void set_is_lhs(bool new_value);

private:
   bool is_lhs;
};

class ast_expression_bin : public ast_expression {
public:
   ast_expression_bin(int oper, ast_expression *, ast_expression *);

   virtual void print(void) const;
};

/**
 * Subclass of expressions for function calls
 */
class ast_function_expression : public ast_expression {
public:
   ast_function_expression(ast_expression *callee)
      : ast_expression(ast_function_call, callee,
		       NULL, NULL),
	cons(false)
   {
      /* empty */
   }

   ast_function_expression(class ast_type_specifier *type)
      : ast_expression(ast_function_call, (ast_expression *) type,
		       NULL, NULL),
	cons(true)
   {
      /* empty */
   }

   bool is_constructor() const
   {
      return cons;
   }

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   virtual void hir_no_rvalue(exec_list *instructions,
                              struct _mesa_glsl_parse_state *state);

   virtual bool has_sequence_subexpression() const;

private:
   /**
    * Is this function call actually a constructor?
    */
   bool cons;
   ir_rvalue *
   handle_method(exec_list *instructions,
                 struct _mesa_glsl_parse_state *state);
};

class ast_subroutine_list : public ast_node
{
public:
   virtual void print(void) const;
   exec_list declarations;
};

class ast_array_specifier : public ast_node {
public:
   ast_array_specifier(const struct YYLTYPE &locp, ast_expression *dim)
   {
      set_location(locp);
      array_dimensions.push_tail(&dim->link);
   }

   void add_dimension(ast_expression *dim)
   {
      array_dimensions.push_tail(&dim->link);
   }

   bool is_single_dimension() const
   {
      return this->array_dimensions.get_tail_raw()->prev != NULL &&
             this->array_dimensions.get_tail_raw()->prev->is_head_sentinel();
   }

   virtual void print(void) const;

   /* This list contains objects of type ast_node containing the
    * array dimensions in outermost-to-innermost order.
    */
   exec_list array_dimensions;
};

class ast_layout_expression : public ast_node {
public:
   ast_layout_expression(const struct YYLTYPE &locp, ast_expression *expr)
   {
      set_location(locp);
      layout_const_expressions.push_tail(&expr->link);
   }

   bool process_qualifier_constant(struct _mesa_glsl_parse_state *state,
                                   const char *qual_indentifier,
                                   unsigned *value, bool can_be_zero);

   void merge_qualifier(ast_layout_expression *l_expr)
   {
      layout_const_expressions.append_list(&l_expr->layout_const_expressions);
   }

   exec_list layout_const_expressions;
};

/**
 * C-style aggregate initialization class
 *
 * Represents C-style initializers of vectors, matrices, arrays, and
 * structures. E.g., vec3 pos = {1.0, 0.0, -1.0} is equivalent to
 * vec3 pos = vec3(1.0, 0.0, -1.0).
 *
 * Specified in GLSL 4.20 and GL_ARB_shading_language_420pack.
 *
 * \sa _mesa_ast_set_aggregate_type
 */
class ast_aggregate_initializer : public ast_expression {
public:
   ast_aggregate_initializer()
      : ast_expression(ast_aggregate, NULL, NULL, NULL),
        constructor_type(NULL)
   {
      /* empty */
   }

   /**
    * glsl_type of the aggregate, which is inferred from the LHS of whatever
    * the aggregate is being used to initialize.  This can't be inferred at
    * parse time (since the parser deals with ast_type_specifiers, not
    * glsl_types), so the parser leaves it NULL.  However, the ast-to-hir
    * conversion code makes sure to fill it in with the appropriate type
    * before hir() is called.
    */
   const glsl_type *constructor_type;

   virtual ir_rvalue *hir(exec_list *instructions,
                          struct _mesa_glsl_parse_state *state);

   virtual void hir_no_rvalue(exec_list *instructions,
                              struct _mesa_glsl_parse_state *state);
};


class ast_compound_statement : public ast_node {
public:
   ast_compound_statement(int new_scope, ast_node *statements);
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   int new_scope;
   exec_list statements;
};

class ast_declaration : public ast_node {
public:
   ast_declaration(const char *identifier,
                   ast_array_specifier *array_specifier,
                   ast_expression *initializer);
   virtual void print(void) const;

   const char *identifier;

   ast_array_specifier *array_specifier;

   ast_expression *initializer;
};


enum {
   ast_precision_none = 0, /**< Absence of precision qualifier. */
   ast_precision_high,
   ast_precision_medium,
   ast_precision_low
};

enum {
   ast_depth_none = 0, /**< Absence of depth qualifier. */
   ast_depth_any,
   ast_depth_greater,
   ast_depth_less,
   ast_depth_unchanged
};

struct ast_type_qualifier {
   DECLARE_RALLOC_CXX_OPERATORS(ast_type_qualifier);
   /* Note: this bitset needs to have at least as many bits as the 'q'
    * struct has flags, below.  Previously, the size was 128 instead of 96.
    * But an apparent bug in GCC 5.4.0 causes bad SSE code generation
    * elsewhere, leading to a crash.  96 bits works around the issue.
    * See https://bugs.freedesktop.org/show_bug.cgi?id=105497
    */
   DECLARE_BITSET_T(bitset_t, 96);

   union flags {
      struct {
	 unsigned invariant:1;
         unsigned precise:1;
	 unsigned constant:1;
	 unsigned attribute:1;
	 unsigned varying:1;
	 unsigned in:1;
	 unsigned out:1;
	 unsigned centroid:1;
         unsigned sample:1;
	 unsigned patch:1;
	 unsigned uniform:1;
	 unsigned buffer:1;
	 unsigned shared_storage:1;
	 unsigned smooth:1;
	 unsigned flat:1;
	 unsigned noperspective:1;

	 /** \name Layout qualifiers for GL_ARB_fragment_coord_conventions */
	 /*@{*/
	 unsigned origin_upper_left:1;
	 unsigned pixel_center_integer:1;
	 /*@}*/

         /**
          * Flag set if GL_ARB_enhanced_layouts "align" layout qualifier is
          * used.
          */
         unsigned explicit_align:1;

	 /**
	  * Flag set if GL_ARB_explicit_attrib_location "location" layout
	  * qualifier is used.
	  */
	 unsigned explicit_location:1;
	 /**
	  * Flag set if GL_ARB_explicit_attrib_location "index" layout
	  * qualifier is used.
	  */
	 unsigned explicit_index:1;

	 /**
	  * Flag set if GL_ARB_enhanced_layouts "component" layout
	  * qualifier is used.
	  */
	 unsigned explicit_component:1;

         /**
          * Flag set if GL_ARB_shading_language_420pack "binding" layout
          * qualifier is used.
          */
         unsigned explicit_binding:1;

         /**
          * Flag set if GL_ARB_shader_atomic counter "offset" layout
          * qualifier is used.
          */
         unsigned explicit_offset:1;

         /** \name Layout qualifiers for GL_AMD_conservative_depth */
         /** \{ */
         unsigned depth_type:1;
         /** \} */

	 /** \name Layout qualifiers for GL_ARB_uniform_buffer_object */
	 /** \{ */
         unsigned std140:1;
         unsigned std430:1;
         unsigned shared:1;
         unsigned packed:1;
         unsigned column_major:1;
         unsigned row_major:1;
	 /** \} */

	 /** \name Layout qualifiers for GLSL 1.50 geometry shaders */
	 /** \{ */
	 unsigned prim_type:1;
	 unsigned max_vertices:1;
	 /** \} */

         /**
          * local_size_{x,y,z} flags for compute shaders.  Bit 0 represents
          * local_size_x, and so on.
          */
         unsigned local_size:3;

	 /** \name Layout qualifiers for ARB_compute_variable_group_size. */
	 /** \{ */
	 unsigned local_size_variable:1;
	 /** \} */

	 /** \name Layout and memory qualifiers for ARB_shader_image_load_store. */
	 /** \{ */
	 unsigned early_fragment_tests:1;
	 unsigned explicit_image_format:1;
	 unsigned coherent:1;
	 unsigned _volatile:1;
	 unsigned restrict_flag:1;
	 unsigned read_only:1; /**< "readonly" qualifier. */
	 unsigned write_only:1; /**< "writeonly" qualifier. */
	 /** \} */

         /** \name Layout qualifiers for GL_ARB_gpu_shader5 */
         /** \{ */
         unsigned invocations:1;
         unsigned stream:1; /**< Has stream value assigned  */
         unsigned explicit_stream:1; /**< stream value assigned explicitly by shader code */
         /** \} */

         /** \name Layout qualifiers for GL_ARB_enhanced_layouts */
         /** \{ */
         unsigned explicit_xfb_offset:1; /**< xfb_offset value assigned explicitly by shader code */
         unsigned xfb_buffer:1; /**< Has xfb_buffer value assigned  */
         unsigned explicit_xfb_buffer:1; /**< xfb_buffer value assigned explicitly by shader code */
         unsigned xfb_stride:1; /**< Is xfb_stride value yet to be merged with global values  */
         unsigned explicit_xfb_stride:1; /**< xfb_stride value assigned explicitly by shader code */
         /** \} */

	 /** \name Layout qualifiers for GL_ARB_tessellation_shader */
	 /** \{ */
	 /* tess eval input layout */
	 /* gs prim_type reused for primitive mode */
	 unsigned vertex_spacing:1;
	 unsigned ordering:1;
	 unsigned point_mode:1;
	 /* tess control output layout */
	 unsigned vertices:1;
	 /** \} */

         /** \name Qualifiers for GL_ARB_shader_subroutine */
	 /** \{ */
         unsigned subroutine:1;  /**< Is this marked 'subroutine' */
	 /** \} */

         /** \name Qualifiers for GL_KHR_blend_equation_advanced */
         /** \{ */
         unsigned blend_support:1; /**< Are there any blend_support_ qualifiers */
         /** \} */

         /**
          * Flag set if GL_ARB_post_depth_coverage layout qualifier is used.
          */
         unsigned post_depth_coverage:1;

         /**
          * Flags for the layout qualifers added by ARB_fragment_shader_interlock
          */

         unsigned pixel_interlock_ordered:1;
         unsigned pixel_interlock_unordered:1;
         unsigned sample_interlock_ordered:1;
         unsigned sample_interlock_unordered:1;

         /**
          * Flag set if GL_INTEL_conservartive_rasterization layout qualifier
          * is used.
          */
         unsigned inner_coverage:1;

         /** \name Layout qualifiers for GL_ARB_bindless_texture */
         /** \{ */
         unsigned bindless_sampler:1;
         unsigned bindless_image:1;
         unsigned bound_sampler:1;
         unsigned bound_image:1;
         /** \} */

         /** \name Layout qualifiers for GL_EXT_shader_framebuffer_fetch_non_coherent */
         /** \{ */
         unsigned non_coherent:1;
         /** \} */

         /** \name Layout qualifiers for NV_compute_shader_derivatives */
         /** \{ */
         unsigned derivative_group:1;
         /** \} */

         /**
          * Flag set if GL_NV_viewport_array2 viewport_relative layout
          * qualifier is used.
          */
         unsigned viewport_relative:1;
      }
      /** \brief Set of flags, accessed by name. */
      q;

      /** \brief Set of flags, accessed as a bitmask. */
      bitset_t i;
   } flags;

   /** Precision of the type (highp/medium/lowp). */
   unsigned precision:2;

   /** Type of layout qualifiers for GL_AMD_conservative_depth. */
   unsigned depth_type:3;

   /**
    * Alignment specified via GL_ARB_enhanced_layouts "align" layout qualifier
    */
   ast_expression *align;

   /** Geometry shader invocations for GL_ARB_gpu_shader5. */
   ast_layout_expression *invocations;

   /**
    * Location specified via GL_ARB_explicit_attrib_location layout
    *
    * \note
    * This field is only valid if \c explicit_location is set.
    */
   ast_expression *location;
   /**
    * Index specified via GL_ARB_explicit_attrib_location layout
    *
    * \note
    * This field is only valid if \c explicit_index is set.
    */
   ast_expression *index;

   /**
    * Component specified via GL_ARB_enhaced_layouts
    *
    * \note
    * This field is only valid if \c explicit_component is set.
    */
   ast_expression *component;

   /** Maximum output vertices in GLSL 1.50 geometry shaders. */
   ast_layout_expression *max_vertices;

   /** Stream in GLSL 1.50 geometry shaders. */
   ast_expression *stream;

   /** xfb_buffer specified via the GL_ARB_enhanced_layouts keyword. */
   ast_expression *xfb_buffer;

   /** xfb_stride specified via the GL_ARB_enhanced_layouts keyword. */
   ast_expression *xfb_stride;

   /** global xfb_stride values for each buffer */
   ast_layout_expression *out_xfb_stride[MAX_FEEDBACK_BUFFERS];

   /**
    * Input or output primitive type in GLSL 1.50 geometry shaders
    * and tessellation shaders.
    */
   GLenum prim_type;

   /**
    * Binding specified via GL_ARB_shading_language_420pack's "binding" keyword.
    *
    * \note
    * This field is only valid if \c explicit_binding is set.
    */
   ast_expression *binding;

   /**
    * Offset specified via GL_ARB_shader_atomic_counter's or
    * GL_ARB_enhanced_layouts "offset" keyword, or by GL_ARB_enhanced_layouts
    * "xfb_offset" keyword.
    *
    * \note
    * This field is only valid if \c explicit_offset is set.
    */
   ast_expression *offset;

   /**
    * Local size specified via GL_ARB_compute_shader's "local_size_{x,y,z}"
    * layout qualifier.  Element i of this array is only valid if
    * flags.q.local_size & (1 << i) is set.
    */
   ast_layout_expression *local_size[3];

   /** Tessellation evaluation shader: vertex spacing (equal, fractional even/odd) */
   enum gl_tess_spacing vertex_spacing;

   /** Tessellation evaluation shader: vertex ordering (CW or CCW) */
   GLenum ordering;

   /** Tessellation evaluation shader: point mode */
   bool point_mode;

   /** Tessellation control shader: number of output vertices */
   ast_layout_expression *vertices;

   /**
    * Image format specified with an ARB_shader_image_load_store
    * layout qualifier.
    *
    * \note
    * This field is only valid if \c explicit_image_format is set.
    */
   enum pipe_format image_format;

   /**
    * Arrangement of invocations used to calculate derivatives in a compute
    * shader.  From NV_compute_shader_derivatives.
    */
   enum gl_derivative_group derivative_group;

   /**
    * Base type of the data read from or written to this image.  Only
    * the following enumerants are allowed: GLSL_TYPE_UINT,
    * GLSL_TYPE_INT, GLSL_TYPE_FLOAT.
    *
    * \note
    * This field is only valid if \c explicit_image_format is set.
    */
   glsl_base_type image_base_type;

   /**
    * Return true if and only if an interpolation qualifier is present.
    */
   bool has_interpolation() const;

   /**
    * Return whether a layout qualifier is present.
    */
   bool has_layout() const;

   /**
    * Return whether a storage qualifier is present.
    */
   bool has_storage() const;

   /**
    * Return whether an auxiliary storage qualifier is present.
    */
   bool has_auxiliary_storage() const;

   /**
    * Return true if and only if a memory qualifier is present.
    */
   bool has_memory() const;

   /**
    * Return true if the qualifier is a subroutine declaration.
    */
   bool is_subroutine_decl() const;

   bool merge_qualifier(YYLTYPE *loc,
			_mesa_glsl_parse_state *state,
                        const ast_type_qualifier &q,
                        bool is_single_layout_merge,
                        bool is_multiple_layouts_merge = false);

   /**
    * Validate current qualifier against the global out one.
    */
   bool validate_out_qualifier(YYLTYPE *loc,
                               _mesa_glsl_parse_state *state);

   /**
    * Merge current qualifier into the global out one.
    */
   bool merge_into_out_qualifier(YYLTYPE *loc,
                                 _mesa_glsl_parse_state *state,
                                 ast_node* &node);

   /**
    * Validate current qualifier against the global in one.
    */
   bool validate_in_qualifier(YYLTYPE *loc,
                              _mesa_glsl_parse_state *state);

   /**
    * Merge current qualifier into the global in one.
    */
   bool merge_into_in_qualifier(YYLTYPE *loc,
                                _mesa_glsl_parse_state *state,
                                ast_node* &node);

   /**
    * Push pending layout qualifiers to the global values.
    */
   bool push_to_global(YYLTYPE *loc,
                       _mesa_glsl_parse_state *state);

   bool validate_flags(YYLTYPE *loc,
                       _mesa_glsl_parse_state *state,
                       const ast_type_qualifier &allowed_flags,
                       const char *message, const char *name);

   ast_subroutine_list *subroutine_list;
};

class ast_declarator_list;

class ast_struct_specifier : public ast_node {
public:
   ast_struct_specifier(const char *identifier,
                        ast_declarator_list *declarator_list);
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   const char *name;
   ast_type_qualifier *layout;
   /* List of ast_declarator_list * */
   exec_list declarations;
   bool is_declaration;
   const glsl_type *type;
};



class ast_type_specifier : public ast_node {
public:
   /** Construct a type specifier from a type name */
   ast_type_specifier(const char *name) 
      : type(NULL), type_name(name), structure(NULL), array_specifier(NULL),
	default_precision(ast_precision_none)
   {
      /* empty */
   }

   /** Construct a type specifier from a structure definition */
   ast_type_specifier(ast_struct_specifier *s)
      : type(NULL), type_name(s->name), structure(s), array_specifier(NULL),
	default_precision(ast_precision_none)
   {
      /* empty */
   }

   ast_type_specifier(const glsl_type *t)
      : type(t), type_name(t->name), structure(NULL), array_specifier(NULL),
        default_precision(ast_precision_none)
   {
      /* empty */
   }

   const struct glsl_type *glsl_type(const char **name,
				     struct _mesa_glsl_parse_state *state)
      const;

   virtual void print(void) const;

   ir_rvalue *hir(exec_list *, struct _mesa_glsl_parse_state *);

   const struct glsl_type *type;
   const char *type_name;
   ast_struct_specifier *structure;

   ast_array_specifier *array_specifier;

   /** For precision statements, this is the given precision; otherwise none. */
   unsigned default_precision:2;
};


class ast_fully_specified_type : public ast_node {
public:
   virtual void print(void) const;
   bool has_qualifiers(_mesa_glsl_parse_state *state) const;

   ast_fully_specified_type() : qualifier(), specifier(NULL)
   {
   }

   const struct glsl_type *glsl_type(const char **name,
				     struct _mesa_glsl_parse_state *state)
      const;

   ast_type_qualifier qualifier;
   ast_type_specifier *specifier;
};


class ast_declarator_list : public ast_node {
public:
   ast_declarator_list(ast_fully_specified_type *);
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   ast_fully_specified_type *type;
   /** List of 'ast_declaration *' */
   exec_list declarations;

   /**
    * Flags for redeclarations. In these cases, no type is specified, to
    * `type` is allowed to be NULL. In all other cases, this would be an error.
    */
   int invariant;     /** < `invariant` redeclaration */
   int precise;       /** < `precise` redeclaration */
};


class ast_parameter_declarator : public ast_node {
public:
   ast_parameter_declarator() :
      type(NULL),
      identifier(NULL),
      array_specifier(NULL),
      formal_parameter(false),
      is_void(false)
   {
      /* empty */
   }

   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   ast_fully_specified_type *type;
   const char *identifier;
   ast_array_specifier *array_specifier;

   static void parameters_to_hir(exec_list *ast_parameters,
				 bool formal, exec_list *ir_parameters,
				 struct _mesa_glsl_parse_state *state);

private:
   /** Is this parameter declaration part of a formal parameter list? */
   bool formal_parameter;

   /**
    * Is this parameter 'void' type?
    *
    * This field is set by \c ::hir.
    */
   bool is_void;
};


class ast_function : public ast_node {
public:
   ast_function(void);

   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   ast_fully_specified_type *return_type;
   const char *identifier;

   exec_list parameters;

private:
   /**
    * Is this prototype part of the function definition?
    *
    * Used by ast_function_definition::hir to process the parameters, etc.
    * of the function.
    *
    * \sa ::hir
    */
   bool is_definition;

   /**
    * Function signature corresponding to this function prototype instance
    *
    * Used by ast_function_definition::hir to process the parameters, etc.
    * of the function.
    *
    * \sa ::hir
    */
   class ir_function_signature *signature;

   friend class ast_function_definition;
};


class ast_expression_statement : public ast_node {
public:
   ast_expression_statement(ast_expression *);
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   ast_expression *expression;
};


class ast_case_label : public ast_node {
public:
   ast_case_label(ast_expression *test_value);
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   /**
    * An test value of NULL means 'default'.
    */
   ast_expression *test_value;
};


class ast_case_label_list : public ast_node {
public:
   ast_case_label_list(void);
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   /**
    * A list of case labels.
    */
   exec_list labels;
};


class ast_case_statement : public ast_node {
public:
   ast_case_statement(ast_case_label_list *labels);
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   ast_case_label_list *labels;

   /**
    * A list of statements.
    */
   exec_list stmts;
};


class ast_case_statement_list : public ast_node {
public:
   ast_case_statement_list(void);
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   /**
    * A list of cases.
    */
   exec_list cases;
};


class ast_switch_body : public ast_node {
public:
   ast_switch_body(ast_case_statement_list *stmts);
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   ast_case_statement_list *stmts;
};


class ast_selection_statement : public ast_node {
public:
   ast_selection_statement(ast_expression *condition,
			   ast_node *then_statement,
			   ast_node *else_statement);
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   ast_expression *condition;
   ast_node *then_statement;
   ast_node *else_statement;
};


class ast_switch_statement : public ast_node {
public:
   ast_switch_statement(ast_expression *test_expression,
			ast_node *body);
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   ast_expression *test_expression;
   ast_node *body;

protected:
   void test_to_hir(exec_list *, struct _mesa_glsl_parse_state *);
};

class ast_iteration_statement : public ast_node {
public:
   ast_iteration_statement(int mode, ast_node *init, ast_node *condition,
			   ast_expression *rest_expression, ast_node *body);

   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *, struct _mesa_glsl_parse_state *);

   enum ast_iteration_modes {
      ast_for,
      ast_while,
      ast_do_while
   } mode;
   

   ast_node *init_statement;
   ast_node *condition;
   ast_expression *rest_expression;

   ast_node *body;

   /**
    * Generate IR from the condition of a loop
    *
    * This is factored out of ::hir because some loops have the condition
    * test at the top (for and while), and others have it at the end (do-while).
    */
   void condition_to_hir(exec_list *, struct _mesa_glsl_parse_state *);
};


class ast_jump_statement : public ast_node {
public:
   ast_jump_statement(int mode, ast_expression *return_value);
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   enum ast_jump_modes {
      ast_continue,
      ast_break,
      ast_return,
      ast_discard
   } mode;

   ast_expression *opt_return_value;
};


class ast_demote_statement : public ast_node {
public:
   ast_demote_statement(void) {}
   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
                          struct _mesa_glsl_parse_state *state);
};


class ast_function_definition : public ast_node {
public:
   ast_function_definition() : prototype(NULL), body(NULL)
   {
   }

   virtual void print(void) const;

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   ast_function *prototype;
   ast_compound_statement *body;
};

class ast_interface_block : public ast_node {
public:
   ast_interface_block(const char *instance_name,
                       ast_array_specifier *array_specifier)
   : block_name(NULL), instance_name(instance_name),
     array_specifier(array_specifier)
   {
   }

   virtual ir_rvalue *hir(exec_list *instructions,
			  struct _mesa_glsl_parse_state *state);

   ast_type_qualifier default_layout;
   ast_type_qualifier layout;
   const char *block_name;

   /**
    * Declared name of the block instance, if specified.
    *
    * If the block does not have an instance name, this field will be
    * \c NULL.
    */
   const char *instance_name;

   /** List of ast_declarator_list * */
   exec_list declarations;

   /**
    * Declared array size of the block instance
    *
    * If the block is not declared as an array or if the block instance array
    * is unsized, this field will be \c NULL.
    */
   ast_array_specifier *array_specifier;
};


/**
 * AST node representing a declaration of the output layout for tessellation
 * control shaders.
 */
class ast_tcs_output_layout : public ast_node
{
public:
   ast_tcs_output_layout(const struct YYLTYPE &locp)
   {
      set_location(locp);
   }

   virtual ir_rvalue *hir(exec_list *instructions,
                          struct _mesa_glsl_parse_state *state);
};


/**
 * AST node representing a declaration of the input layout for geometry
 * shaders.
 */
class ast_gs_input_layout : public ast_node
{
public:
   ast_gs_input_layout(const struct YYLTYPE &locp, GLenum prim_type)
      : prim_type(prim_type)
   {
      set_location(locp);
   }

   virtual ir_rvalue *hir(exec_list *instructions,
                          struct _mesa_glsl_parse_state *state);

private:
   const GLenum prim_type;
};


/**
 * AST node representing a decalaration of the input layout for compute
 * shaders.
 */
class ast_cs_input_layout : public ast_node
{
public:
   ast_cs_input_layout(const struct YYLTYPE &locp,
                       ast_layout_expression *const *local_size)
   {
      for (int i = 0; i < 3; i++) {
         this->local_size[i] = local_size[i];
      }
      set_location(locp);
   }

   virtual ir_rvalue *hir(exec_list *instructions,
                          struct _mesa_glsl_parse_state *state);

private:
   ast_layout_expression *local_size[3];
};

class ast_warnings_toggle : public ast_node {
public:
   ast_warnings_toggle(bool _enable)
      : enable(_enable)
   {
      /* empty */
   }

   virtual ir_rvalue *hir(exec_list *instructions,
                          struct _mesa_glsl_parse_state *state);

private:
   bool enable;
};
/*@}*/

extern void
_mesa_ast_to_hir(exec_list *instructions, struct _mesa_glsl_parse_state *state);

extern ir_rvalue *
_mesa_ast_field_selection_to_hir(const ast_expression *expr,
				 exec_list *instructions,
				 struct _mesa_glsl_parse_state *state);

extern ir_rvalue *
_mesa_ast_array_index_to_hir(void *mem_ctx,
			     struct _mesa_glsl_parse_state *state,
			     ir_rvalue *array, ir_rvalue *idx,
			     YYLTYPE &loc, YYLTYPE &idx_loc);

extern void
_mesa_ast_set_aggregate_type(const glsl_type *type,
                             ast_expression *expr);

void
emit_function(_mesa_glsl_parse_state *state, ir_function *f);

extern void
check_builtin_array_max_size(const char *name, unsigned size,
                             YYLTYPE loc, struct _mesa_glsl_parse_state *state);

extern void _mesa_ast_process_interface_block(YYLTYPE *locp,
                                              _mesa_glsl_parse_state *state,
                                              ast_interface_block *const block,
                                              const struct ast_type_qualifier &q);

extern bool
process_qualifier_constant(struct _mesa_glsl_parse_state *state,
                           YYLTYPE *loc,
                           const char *qual_indentifier,
                           ast_expression *const_expression,
                           unsigned *value);
#endif /* AST_H */
