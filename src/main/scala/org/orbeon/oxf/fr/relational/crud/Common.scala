/**
 * Copyright (C) 2013 Orbeon, Inc.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the
 * GNU Lesser General Public License as published by the Free Software Foundation; either version
 * 2.1 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Lesser General Public License for more details.
 *
 * The full text of the license is available at http://www.gnu.org/copyleft/lesser.html
 */
package org.orbeon.oxf.fr.relational.crud

import java.sql.Connection
import org.orbeon.oxf.util.ScalaUtils._
import org.orbeon.oxf.fr.relational.{ForDocument, Specific, Next, Unspecified}
import org.orbeon.oxf.util.{LoggerFactory, IndentedLogger}
import org.orbeon.oxf.fr.{FormRunnerPersistence, FormRunner}
import org.orbeon.oxf.webapp.HttpStatusCodeException
import org.orbeon.scaxon.XML._

trait Common extends RequestResponse with FormRunnerPersistence {

    implicit val Logger = new IndentedLogger(LoggerFactory.createLogger(classOf[CRUD]), "")

    def formVersion(connection: Connection, app: String, form: String, docId: Option[String]): Option[Int] = {
        val versionResult = {
            val table = s"orbeon_form_${if (docId.isEmpty) "definition" else "data"}"
            val ps = connection.prepareStatement(
                s"""select max(form_version)
                   |  from $table
                   | where (last_modified_time, app, form, form_version) in
                   |       (
                   |             select max(last_modified_time) last_modified_time, app, form, form_version
                   |               from $table
                   |              where app = ?
                   |                    and form = ?
                   |                    ${docId.map(_ ⇒ "and document_id = ?").getOrElse("")}
                   |           group by app, form, form_version
                   |       )
                   |   and deleted = 'N'
                 """.stripMargin)
                          ps.setString(1, app)
                          ps.setString(2, form)
            docId.foreach(ps.setString(3, _))
            val rs = ps.executeQuery()
            rs.next(); rs
        }
        val version = versionResult.getInt(1)
        if (versionResult.wasNull()) None else Some(version)
    }

    /**
     * For every request, there is a corresponding specific form version number. In the request, that specific version
     * can be specified, but the caller can also say that it wants the next version, the latest version, or the version
     * of the form used to create a specific document. This function finds the specific form version corresponding to
     * the request.
     */
    def requestedFormVersion(connection: Connection, req: Request): Int = {
        def latest = formVersion(connection, req.app, req.form, None)
        req.version match {
            case Unspecified        ⇒ latest.getOrElse(1)
            case Next               ⇒ latest.map(_ + 1).getOrElse(1)
            case Specific(v)        ⇒ v
            case ForDocument(docId) ⇒ formVersion(connection, req.app, req.form, Some(docId))
                                           .getOrElse(throw new HttpStatusCodeException(404))
        }
    }

    // List of columns that identify a row
    def idColumns(req: Request): String =
        Seq(
            Some("app"), Some("form"),
            req.forForm       option "form_version",
            req.forData       option "document_id",
            req.forData       option "draft",
            req.forAttachment option "file_name"
        ).flatten.mkString(", ")

    // Given a user/group name coming from the data, tells us what operations we can do in this data, assuming that
    // it is for the current request app/form
    def authorizedOperations(req: Request, dataUserGroup: Option[(String, String)]): Set[String] = {
        val metadata    = readFormMetadata(req.app, req.form).ensuring(_.isDefined, "can't find form metadata for data").get
        val permissions = (metadata / "forms" / "form" / "permissions").headOption
        permissions match {
            case None                ⇒ Set("create", "read", "update", "delete")
            case Some(permissionsEl) ⇒
                if (dataUserGroup.isDefined) {
                    val (username, groupname) = dataUserGroup.get
                    FormRunner.allAuthorizedOperations(permissionsEl, username, groupname).toSet
                } else
                    FormRunner.authorizedOperationsBasedOnRoles(permissionsEl).toSet
        }
    }
}
